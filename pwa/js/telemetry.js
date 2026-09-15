// vibesODB2 Telemetry Engine (Fast / Slow loops and Simulator bridge)

export class TelemetryEngine {
  constructor({ bleTransport, simulator, onUpdate, onRateUpdate }) {
    this.transport = bleTransport;
    this.simulator = simulator;
    this.onUpdate = onUpdate || (() => {});
    this.onRateUpdate = onRateUpdate || (() => {});

    this.isRunning = false;
    this.isSimulation = true;
    this.simTimer = null;
    this.bleLoopActive = false;

    this.packetCount = 0;
    this.sampleCount = 0;
    this.lastRateCalc = Date.now();
    this.currentHz = 0;

    this.latestMetrics = {
      vehicle_speed_kmh: 0,
      engine_rpm: 0,
      coolant_temp_c: 85,
      intake_manifold_pressure_kpa: 101,
      boost_pressure_bar: 0.0,
      throttle_position_pct: 0,
      intake_air_temp_c: 20,
      fuel_rail_pressure_bar: 300,
      dpf_soot_mass_g: 15.0,
      exhaust_gas_temp_c: 250,
      engaged_gear: 'P'
    };
  }

  setSimulationMode(isSim) {
    const wasRunning = this.isRunning;
    if (wasRunning) this.stop();
    this.isSimulation = isSim;
    if (wasRunning) this.start();
  }

  start() {
    this.isRunning = true;
    this.packetCount = 0;
    this.sampleCount = 0;
    this.lastRateCalc = Date.now();

    if (this.isSimulation) {
      this._startSimLoop();
    } else {
      this._startBleLoop();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    this.bleLoopActive = false;
  }

  _startSimLoop() {
    // 33ms interval = ~30 Hz refresh rate for smooth cockpit needles
    this.simTimer = setInterval(() => {
      if (!this.isRunning) return;
      const data = this.simulator.tick();
      this.latestMetrics = { ...this.latestMetrics, ...data.metrics };
      this._recordSample();
      this.onUpdate(this.latestMetrics);
    }, 33);
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
    const parts = raw.split(/\s+/);
    // Find 41 0C (RPM)
    const rpmIdx = parts.indexOf('0C');
    if (rpmIdx > 0 && parts[rpmIdx - 1] === '41' && parts.length > rpmIdx + 2) {
      const a = parseInt(parts[rpmIdx + 1], 16);
      const b = parseInt(parts[rpmIdx + 2], 16);
      this.latestMetrics.engine_rpm = Math.round(((a * 256) + b) / 4.0);
    }
    // Find 41 0D (Speed)
    const spdIdx = parts.indexOf('0D');
    if (spdIdx > 0 && parts[spdIdx - 1] === '41' && parts.length > spdIdx + 1) {
      this.latestMetrics.vehicle_speed_kmh = parseInt(parts[spdIdx + 1], 16);
    }
  }

  _parseObdSlow(raw) {
    const parts = raw.split(/\s+/);
    // 41 05 (Coolant Temp: A - 40)
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
