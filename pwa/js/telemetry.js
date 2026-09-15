// vibesODB2 Real-Time Telemetry Engine (Fast / Slow OBD-II Polling Loops)

export class TelemetryEngine {
  constructor({ bleTransport, onUpdate, onRateUpdate }) {
    this.transport = bleTransport;
    this.onUpdate = onUpdate || (() => {});
    this.onRateUpdate = onRateUpdate || (() => {});

    this.isRunning = false;
    this.bleLoopActive = false;

    this.packetCount = 0;
    this.sampleCount = 0;
    this.lastRateCalc = Date.now();
    this.currentHz = 0;

    this.latestMetrics = this.getInitialMetrics();
  }

  getInitialMetrics() {
    return {
      vehicle_speed_kmh: null,
      engine_rpm: null,
      coolant_temp_c: null,
      intake_manifold_pressure_kpa: null,
      boost_pressure_bar: null,
      throttle_position_pct: null,
      intake_air_temp_c: null,
      fuel_rail_pressure_bar: null,
      dpf_soot_load_g: null,
      exhaust_gas_temp_c: null,
      engaged_gear: '--'
    };
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.packetCount = 0;
    this.sampleCount = 0;
    this.lastRateCalc = Date.now();
    this._startBleLoop();
  }

  stop() {
    this.isRunning = false;
    this.bleLoopActive = false;
    this.latestMetrics = this.getInitialMetrics();
    this.currentHz = 0;
    this.onRateUpdate({ hz: 0, packetCount: this.packetCount });
    this.onUpdate(this.latestMetrics);
  }

  async _startBleLoop() {
    this.bleLoopActive = true;
    let slowCounter = 0;

    while (this.isRunning && this.bleLoopActive && this.transport.isConnected) {
      const startTime = performance.now();
      try {
        // Fast loop: Mode 01 PID 0C (RPM) & 0D (Speed)
        await this.transport.setHeader('7DF');
        const resFast = await this.transport.sendCommand('01 0C 0D', 1500);
        this._parseObdFast(resFast);

        // Periodic slow loop (every ~10 fast iterations)
        slowCounter++;
        if (slowCounter >= 10) {
          slowCounter = 0;
          // Coolant (05) and Boost/MAP (0B)
          const resSlow = await this.transport.sendCommand('01 05 0B', 1500);
          this._parseObdSlow(resSlow);
        }

        this._recordSample();
        this.onUpdate(this.latestMetrics);
      } catch (err) {
        // Small backoff on frame drop
        await new Promise((r) => setTimeout(r, 50));
      }

      const elapsed = performance.now() - startTime;
      const waitTime = Math.max(10, 30 - elapsed);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }

  _parseObdFast(raw) {
    if (!raw) return;
    const parts = raw.split(/\s+/);
    // Find 41 0C (RPM: ((A*256)+B)/4)
    const rpmIdx = parts.indexOf('0C');
    if (rpmIdx > 0 && parts[rpmIdx - 1] === '41' && parts.length > rpmIdx + 2) {
      const a = parseInt(parts[rpmIdx + 1], 16);
      const b = parseInt(parts[rpmIdx + 2], 16);
      this.latestMetrics.engine_rpm = Math.round(((a * 256) + b) / 4.0);
    }
    // Find 41 0D (Speed: A km/h)
    const spdIdx = parts.indexOf('0D');
    if (spdIdx > 0 && parts[spdIdx - 1] === '41' && parts.length > spdIdx + 1) {
      this.latestMetrics.vehicle_speed_kmh = parseInt(parts[spdIdx + 1], 16);
    }
  }

  _parseObdSlow(raw) {
    if (!raw) return;
    const parts = raw.split(/\s+/);
    // 41 05 (Coolant Temp: A - 40 °C)
    const cltIdx = parts.indexOf('05');
    if (cltIdx > 0 && parts[cltIdx - 1] === '41' && parts.length > cltIdx + 1) {
      this.latestMetrics.coolant_temp_c = parseInt(parts[cltIdx + 1], 16) - 40;
    }
    // 41 0B (MAP: A kPa)
    const mapIdx = parts.indexOf('0B');
    if (mapIdx > 0 && parts[mapIdx - 1] === '41' && parts.length > mapIdx + 1) {
      const map = parseInt(parts[mapIdx + 1], 16);
      this.latestMetrics.intake_manifold_pressure_kpa = map;
      this.latestMetrics.boost_pressure_bar = Math.max(0, Number(((map - 101.3) / 100.0).toFixed(2)));
    }
  }

  _recordSample() {
    this.packetCount++;
    this.sampleCount++;
    const now = Date.now();
    const dt = (now - this.lastRateCalc) / 1000.0;
    if (dt >= 1.0) {
      this.currentHz = Number((this.sampleCount / dt).toFixed(1));
      this.sampleCount = 0;
      this.lastRateCalc = now;
      this.onRateUpdate({
        hz: this.currentHz,
        packetCount: this.packetCount
      });
    }
  }
}
