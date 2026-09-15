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
    let loopCycle = 0;

    // Set OBD-II Functional Broadcast header (7DF) ONCE upon starting loop
    try {
      if (this.transport && this.transport.isConnected) {
        await this.transport.setHeader('7DF');
      }
    } catch (e) {
      console.warn('Could not set 7DF header:', e);
    }

    while (this.isRunning && this.bleLoopActive && this.transport && this.transport.isConnected) {
      const startTime = performance.now();
      try {
        loopCycle++;

        // 1. FAST TIER (Every cycle: RPM and Speed)
        // Querying individually ensures maximum compatibility across all VAG / MQB ECUs
        const resRpm = await this.transport.sendCommand('010C', 800);
        this.parsePidResponse(resRpm);

        const resSpd = await this.transport.sendCommand('010D', 800);
        this.parsePidResponse(resSpd);

        // Estimate current engaged gear from RPM and Speed
        if (this.latestMetrics.engine_rpm !== null && this.latestMetrics.vehicle_speed_kmh !== null) {
          this.latestMetrics.engaged_gear = this._calculateGear(
            this.latestMetrics.engine_rpm,
            this.latestMetrics.vehicle_speed_kmh
          );
        }

        // 2. MEDIUM TIER (Every 4 cycles: Boost/MAP & Throttle)
        if (loopCycle % 4 === 0) {
          const resMap = await this.transport.sendCommand('010B', 800);
          this.parsePidResponse(resMap);

          const resTh = await this.transport.sendCommand('0111', 800);
          this.parsePidResponse(resTh);
        }

        // 3. SLOW TIER (Every 10 cycles: Coolant, IAT, Fuel Rail)
        if (loopCycle % 10 === 0) {
          const resClt = await this.transport.sendCommand('0105', 1000);
          this.parsePidResponse(resClt);

          const resIat = await this.transport.sendCommand('010F', 1000);
          this.parsePidResponse(resIat);

          const resFuel = await this.transport.sendCommand('0123', 1000);
          this.parsePidResponse(resFuel);
        }

        this._recordSample();
        this.onUpdate(this.latestMetrics);
      } catch (err) {
        // Small backoff on frame drop / timeout
        await new Promise((r) => setTimeout(r, 40));
      }

      const elapsed = performance.now() - startTime;
      const waitTime = Math.max(10, 40 - elapsed);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }

  /**
   * Universal Mode 01 PID Response Parser.
   * Accurately parses standard OBD-II frames, whether single or multi-PID,
   * with or without CAN frame headers (e.g. "41 0C 0A 1B", "7E8 04 41 0D 32").
   */
  parsePidResponse(raw) {
    if (!raw) return;
    const clean = raw.replace(/>/g, ' ').toUpperCase().trim();
    const parts = clean.split(/\s+/).filter(Boolean);

    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '41' && i + 2 < parts.length) {
        let cursor = i + 1;
        while (cursor < parts.length && parts[cursor] !== '41') {
          const pid = parts[cursor];
          if (pid === '0C' && cursor + 2 < parts.length) {
            // RPM: ((A * 256) + B) / 4.0
            const a = parseInt(parts[cursor + 1], 16);
            const b = parseInt(parts[cursor + 2], 16);
            if (!isNaN(a) && !isNaN(b)) {
              this.latestMetrics.engine_rpm = Math.round(((a * 256) + b) / 4.0);
            }
            cursor += 3;
          } else if (pid === '0D' && cursor + 1 < parts.length) {
            // Speed: A km/h
            const spd = parseInt(parts[cursor + 1], 16);
            if (!isNaN(spd)) {
              this.latestMetrics.vehicle_speed_kmh = spd;
            }
            cursor += 2;
          } else if (pid === '05' && cursor + 1 < parts.length) {
            // Coolant Temp: A - 40 °C
            const clt = parseInt(parts[cursor + 1], 16);
            if (!isNaN(clt)) {
              this.latestMetrics.coolant_temp_c = clt - 40;
            }
            cursor += 2;
          } else if (pid === '0B' && cursor + 1 < parts.length) {
            // MAP: A kPa -> Gauge Boost (relative to 101.3 kPa atm)
            const map = parseInt(parts[cursor + 1], 16);
            if (!isNaN(map)) {
              this.latestMetrics.intake_manifold_pressure_kpa = map;
              this.latestMetrics.boost_pressure_bar = Math.max(0, Number(((map - 101.3) / 100.0).toFixed(2)));
            }
            cursor += 2;
          } else if (pid === '0F' && cursor + 1 < parts.length) {
            // Intake Air Temp: A - 40 °C
            const iat = parseInt(parts[cursor + 1], 16);
            if (!isNaN(iat)) {
              this.latestMetrics.intake_air_temp_c = iat - 40;
            }
            cursor += 2;
          } else if (pid === '11' && cursor + 1 < parts.length) {
            // Throttle Position: (A * 100) / 255 %
            const th = parseInt(parts[cursor + 1], 16);
            if (!isNaN(th)) {
              this.latestMetrics.throttle_position_pct = Number(((th * 100) / 255.0).toFixed(1));
            }
            cursor += 2;
          } else if (pid === '23' && cursor + 2 < parts.length) {
            // Fuel Rail Pressure: ((A * 256) + B) * 10 kPa
            const a = parseInt(parts[cursor + 1], 16);
            const b = parseInt(parts[cursor + 2], 16);
            if (!isNaN(a) && !isNaN(b)) {
              this.latestMetrics.fuel_rail_pressure_bar = Number((((a * 256) + b) * 10 / 100.0).toFixed(1));
            }
            cursor += 3;
          } else {
            cursor++;
          }
        }
      }
    }
  }

  _calculateGear(rpm, speed) {
    if (speed < 4 || rpm < 500) return 'N';
    const ratio = rpm / speed;
    if (ratio > 95) return '1';
    if (ratio > 58) return '2';
    if (ratio > 40) return '3';
    if (ratio > 29) return '4';
    if (ratio > 22) return '5';
    if (ratio > 17) return '6';
    return '7';
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
