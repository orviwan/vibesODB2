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

    // Session Recording Buffer
    this.isRecording = false;
    this.recordStartTime = null;
    this.recordedSamples = [];
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
      engine_load_pct: null,
      oil_temp_c: null,
      battery_voltage: null,
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

        // 2. MEDIUM TIER (Every 3 cycles: Boost/MAP, Throttle / Accelerator Pedal, Engine Load)
        if (loopCycle % 3 === 0) {
          const resMap = await this.transport.sendCommand('010B', 800);
          this.parsePidResponse(resMap);

          // Query Accelerator Pedal Pos D (0149) or fallback Throttle (0111)
          const resPedal = await this.transport.sendCommand('0149', 800);
          this.parsePidResponse(resPedal);
          if (this.latestMetrics.throttle_position_pct === null) {
            const resTh = await this.transport.sendCommand('0111', 800);
            this.parsePidResponse(resTh);
          }

          const resLoad = await this.transport.sendCommand('0104', 800);
          this.parsePidResponse(resLoad);
        }

        // 3. SLOW TIER (Every 8 cycles: Coolant, IAT, Fuel Rail, DPF Soot, EGT, Oil Temp, Voltage)
        if (loopCycle % 8 === 0) {
          const resClt = await this.transport.sendCommand('0105', 900);
          this.parsePidResponse(resClt);

          const resIat = await this.transport.sendCommand('010F', 900);
          this.parsePidResponse(resIat);

          const resFuel = await this.transport.sendCommand('0123', 900);
          this.parsePidResponse(resFuel);

          // EGT (0178) & DPF Soot (017C) for VAG TDI
          const resEgt = await this.transport.sendCommand('0178', 900);
          this.parsePidResponse(resEgt);

          const resSoot = await this.transport.sendCommand('017C', 900);
          this.parsePidResponse(resSoot);

          // Engine Oil Temp (015C)
          const resOil = await this.transport.sendCommand('015C', 900);
          this.parsePidResponse(resOil);

          // Battery Voltage
          const resVolt = await this.transport.sendCommand('ATRV', 600);
          this.parseVoltageResponse(resVolt);
        }

        this._recordSample();
        this.onUpdate(this.latestMetrics);
      } catch (err) {
        // Small backoff on frame drop / timeout
        await new Promise((r) => setTimeout(r, 40));
      }

      const elapsed = performance.now() - startTime;
      const waitTime = Math.max(10, 35 - elapsed);
      await new Promise((r) => setTimeout(r, waitTime));
    }
  }

  parseVoltageResponse(raw) {
    if (!raw) return;
    const match = raw.match(/([0-9]+\.?[0-9]*)\s*V/i);
    if (match) {
      const v = parseFloat(match[1]);
      if (!isNaN(v)) this.latestMetrics.battery_voltage = v;
    }
  }

  /**
   * Universal Mode 01 PID Response Parser.
   * Accurately parses standard OBD-II frames, single or multi-frame.
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
          } else if (pid === '04' && cursor + 1 < parts.length) {
            // Engine Load: (A * 100) / 255 %
            const ld = parseInt(parts[cursor + 1], 16);
            if (!isNaN(ld)) {
              this.latestMetrics.engine_load_pct = Number(((ld * 100) / 255.0).toFixed(1));
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
          } else if ((pid === '11' || pid === '49' || pid === '4A' || pid === '5A') && cursor + 1 < parts.length) {
            // Accelerator Pedal / Throttle Position: (A * 100) / 255 %
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
          } else if (pid === '5C' && cursor + 1 < parts.length) {
            // Engine Oil Temp: A - 40 °C
            const ot = parseInt(parts[cursor + 1], 16);
            if (!isNaN(ot)) {
              this.latestMetrics.oil_temp_c = ot - 40;
            }
            cursor += 2;
          } else if (pid === '78' && cursor + 2 < parts.length) {
            // EGT Sensor 1: ((A * 256) + B) / 10.0 - 40.0 °C
            const a = parseInt(parts[cursor + 1], 16);
            const b = parseInt(parts[cursor + 2], 16);
            if (!isNaN(a) && !isNaN(b)) {
              this.latestMetrics.exhaust_gas_temp_c = Number((((a * 256) + b) / 10.0 - 40.0).toFixed(1));
            }
            cursor += 3;
          } else if (pid === '7C' && cursor + 2 < parts.length) {
            // DPF Bank 1 Soot Mass: ((A * 256) + B) / 100.0 grams
            const a = parseInt(parts[cursor + 1], 16);
            const b = parseInt(parts[cursor + 2], 16);
            if (!isNaN(a) && !isNaN(b)) {
              this.latestMetrics.dpf_soot_load_g = Number((((a * 256) + b) / 100.0).toFixed(2));
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

  startRecording() {
    this.isRecording = true;
    this.recordStartTime = Date.now();
    this.recordedSamples = [];
  }

  stopRecording() {
    this.isRecording = false;
  }

  clearRecording() {
    this.recordedSamples = [];
    this.recordStartTime = null;
  }

  getRecordedCount() {
    return this.recordedSamples.length;
  }

  exportCsv() {
    if (this.recordedSamples.length === 0) return '';
    const headers = [
      'Timestamp_ISO',
      'Elapsed_Seconds',
      'Engine_RPM',
      'Speed_KMH',
      'Speed_MPH',
      'Engaged_Gear',
      'Boost_Bar',
      'Throttle_Pct',
      'Engine_Load_Pct',
      'Coolant_Temp_C',
      'Oil_Temp_C',
      'IAT_C',
      'EGT_C',
      'DPF_Soot_G',
      'Fuel_Rail_Bar',
      'Battery_Voltage_V'
    ];

    const rows = this.recordedSamples.map(s => [
      s.timestamp,
      s.elapsed.toFixed(3),
      s.engine_rpm ?? '',
      s.vehicle_speed_kmh ?? '',
      s.vehicle_speed_kmh != null ? Math.round(s.vehicle_speed_kmh * 0.621371) : '',
      s.engaged_gear ?? '',
      s.boost_pressure_bar != null ? s.boost_pressure_bar.toFixed(2) : '',
      s.throttle_position_pct != null ? s.throttle_position_pct.toFixed(1) : '',
      s.engine_load_pct != null ? s.engine_load_pct.toFixed(1) : '',
      s.coolant_temp_c != null ? Math.round(s.coolant_temp_c) : '',
      s.oil_temp_c != null ? Math.round(s.oil_temp_c) : '',
      s.intake_air_temp_c != null ? Math.round(s.intake_air_temp_c) : '',
      s.exhaust_gas_temp_c != null ? Math.round(s.exhaust_gas_temp_c) : '',
      s.dpf_soot_load_g != null ? s.dpf_soot_load_g.toFixed(2) : '',
      s.fuel_rail_pressure_bar != null ? s.fuel_rail_pressure_bar.toFixed(1) : '',
      s.battery_voltage != null ? s.battery_voltage.toFixed(2) : ''
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  _recordSample() {
    this.packetCount++;
    this.sampleCount++;
    const now = Date.now();

    if (this.isRecording) {
      const elapsed = this.recordStartTime ? (now - this.recordStartTime) / 1000.0 : 0;
      this.recordedSamples.push({
        timestamp: new Date(now).toISOString(),
        elapsed,
        ...this.latestMetrics
      });
      // Safety cap at 50,000 samples (~2 hours continuous fast recording)
      if (this.recordedSamples.length > 50000) {
        this.recordedSamples.shift();
      }
    }

    const dt = (now - this.lastRateCalc) / 1000.0;
    if (dt >= 1.0) {
      this.currentHz = Number((this.sampleCount / dt).toFixed(1));
      this.sampleCount = 0;
      this.lastRateCalc = now;
      this.onRateUpdate({
        hz: this.currentHz,
        packetCount: this.packetCount,
        recordedCount: this.recordedSamples.length,
        isRecording: this.isRecording
      });
    }
  }
}
