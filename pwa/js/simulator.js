// vibesODB2 In-Browser Vehicle Simulator Engine
// Emulates a Vgate vLinker MC+ paired with a multi-module VAG ECU network.
// Compatible with the WebBleTransport contract to enable seamless offline/virtual testing.

export const SIM_PROFILES = {
  transporter_t5: {
    id: 'transporter_t5',
    name: 'VW Transporter T5 (2007 2.5 TDI PD)',
    vin: 'WV1ZZZ7HZ7H000001',
    platform: 'PQ35',
    protocol: 'KWP2000',
    engineType: 'diesel_tdi',
    engineDisplacement: 2.5,
    modules: {
      '0x01': { name: 'Engine Control Module', partNumber: '070906016DH', swVersion: '8547', dtcs: [] },
      '0x03': { name: 'Brake Electronics (ABS/ESP)', partNumber: '7H0907379E', swVersion: '0002', dtcs: [] },
      '0x08': { name: 'Climate Control (HVAC)', partNumber: '7H0907040D', swVersion: '0201', dtcs: [] },
      '0x09': {
        name: 'Central Electrics (Bordnetz SG)',
        partNumber: '7H0937049K',
        swVersion: '0401',
        coding: '0000000000000000',
        dtcs: [
          { code: '01117', status: 0x2F, ftb: 0x08, symptom: '008', desc: 'Generator Terminal DF Load Signal - Implausible Signal' },
          { code: '01598', status: 0x2F, ftb: 0x02, symptom: '002', desc: 'Drive Battery Voltage - Lower Limit Exceeded' }
        ]
      },
      '0x15': {
        name: 'Airbag Control Unit',
        partNumber: '6Q0909605AH',
        swVersion: '0004',
        dtcs: [
          { code: '00588', status: 0x2F, ftb: 0x01, symptom: '001', desc: 'Airbag Igniter; Driver Side (N95) - Resistance Too Low (33-00)' }
        ]
      },
      '0x17': { name: 'Instrument Cluster', partNumber: '7H0920871A', swVersion: '0102', coding: '011001', dtcs: [] },
      '0x19': { name: 'CAN Gateway', partNumber: '6N0909901', swVersion: '0001', dtcs: [] }
    }
  },

  transporter_t51: {
    id: 'transporter_t51',
    name: 'VW Transporter T5.1 (2012 2.0 TDI CR)',
    vin: 'WV1ZZZ7EZEH012345',
    platform: 'PQ25',
    protocol: 'UDS',
    engineType: 'diesel_tdi',
    engineDisplacement: 2.0,
    modules: {
      '0x01': { name: 'Engine Control Module', partNumber: '03L906022JD', swVersion: '9970', dtcs: [] },
      '0x03': { name: 'Brake Electronics (ABS/ESP)', partNumber: '7E0614517A', swVersion: '0105', dtcs: [] },
      '0x08': { name: 'Climate Control (HVAC)', partNumber: '7E5907040E', swVersion: '0402', dtcs: [] },
      '0x09': {
        name: 'Central Electrics (BCM)',
        partNumber: '7H0937087H',
        swVersion: '0304',
        coding: 'B028403C0824240031140000282B0C400000410F60060000200000000000',
        dtcs: [
          { code: 'B104A15', status: 0x2F, ftb: 0x15, desc: 'Rain/Light Recognition Sensor - Open Circuit or Short to Plus' },
          { code: '00532', status: 0x2F, ftb: 0x02, symptom: '002', desc: 'Supply Voltage B+ - Lower Limit Exceeded' }
        ]
      },
      '0x10': { name: 'Park Distance Control', partNumber: '7E0919283', swVersion: '0008', dtcs: [] },
      '0x15': { name: 'Airbag Control Unit', partNumber: '7E0959655A', swVersion: '0012', dtcs: [] },
      '0x17': { name: 'Instrument Cluster', partNumber: '7E0920870B', swVersion: '0305', coding: '110F01', dtcs: [] },
      '0x19': { name: 'CAN Gateway', partNumber: '7H0907530H', swVersion: '0733', dtcs: [] },
      '0x44': { name: 'Power Steering', partNumber: '7E0909144', swVersion: '0005', dtcs: [] }
    }
  },

  golf_mqb: {
    id: 'golf_mqb',
    name: 'VW Golf Mk7 (2017 2.0 TDI MQB)',
    vin: 'WVWZZZAUZEW098765',
    platform: 'MQB',
    protocol: 'UDS',
    engineType: 'diesel_tdi',
    engineDisplacement: 2.0,
    modules: {
      '0x01': { name: 'Engine Control Module', partNumber: '04L906026BK', swVersion: '2314', dtcs: [] },
      '0x02': { name: 'Transmission (DSG)', partNumber: '0D9300041H', swVersion: '4512', dtcs: [] },
      '0x03': { name: 'Brakes & EPB', partNumber: '5Q0614517AF', swVersion: '0410', dtcs: [] },
      '0x08': { name: 'Air Conditioning', partNumber: '5G0907044BG', swVersion: '1201', dtcs: [] },
      '0x09': {
        name: 'Central Electrics (BCM)',
        partNumber: '5Q0937084CF',
        swVersion: '0236',
        coding: '00110842C041A2E40B744080410507E41000208100000000000000000000',
        dtcs: []
      },
      '0x15': { name: 'Airbag', partNumber: '5Q0959655T', swVersion: '0039', dtcs: [] },
      '0x17': { name: 'Instrument Cluster', partNumber: '5G1920791A', swVersion: '1430', coding: '17A40908220000', dtcs: [] },
      '0x19': { name: 'CAN Gateway', partNumber: '3Q0907530C', swVersion: '4325', dtcs: [] }
    }
  }
};

export class SimulatedBleTransport {
  constructor(profileId = 'transporter_t51') {
    this.profileId = profileId;
    this.profile = JSON.parse(JSON.stringify(SIM_PROFILES[profileId] || SIM_PROFILES.transporter_t51));
    this.isConnected = false;
    this.device = {
      id: 'simulated_vehicle_ble',
      name: `Virtual VAG Simulator (${this.profile.platform})`,
      gatt: { connected: true }
    };

    // State
    this.engineRunning = true;
    this.manualRpm = 0;
    this.txHeader = '7DF';
    this.rxFilter = '';
    this.activeSession = 0x01;
    this.batteryVoltage = 12.6;
    this.dpfSootMass = 14.82;
    this.dpfOilAsh = 42.10;
    this.dpfDistanceKm = 342;
    this.startTime = Date.now();
    this.onDisconnectCallback = null;

    // Command receive buffer
    this.rxBuffer = '';
    this.pendingQueue = [];
    this.currentTx = null;
  }

  static isSupported() {
    return true; // Virtual transport always supported
  }

  static getSupportInfo() {
    return {
      supported: true,
      isLinux: false,
      isAndroid: false,
      isIOS: false,
      isChrome: true,
      isFirefox: false,
      isSimulator: true
    };
  }

  setProfile(profileId) {
    if (SIM_PROFILES[profileId]) {
      this.profileId = profileId;
      this.profile = JSON.parse(JSON.stringify(SIM_PROFILES[profileId]));
      this.device.name = `Virtual VAG Simulator (${this.profile.platform})`;
    }
  }

  setEngineRunning(running) {
    this.engineRunning = running;
    this.batteryVoltage = running ? 14.2 : 12.6;
  }

  async connect() {
    this.isConnected = true;
    await this.initAdapter();
    return {
      name: this.device.name,
      id: this.device.id
    };
  }

  async initAdapter() {
    await this.sendCommand('ATZ');
    await this.sendCommand('ATE0');
    await this.sendCommand('ATL0');
    await this.sendCommand('ATH0');
    await this.sendCommand('ATSP6');
    await this.sendCommand('ATCAF1');
    return 'OK';
  }

  async sendCommand(cmd, timeoutMs = 2000) {
    if (!this.isConnected) throw new Error('Simulated BLE Transport not connected');
    return this.processCommand(cmd.trim());
  }

  async setHeader(headerHex) {
    return await this.sendCommand(`ATSH ${headerHex}`);
  }

  async setFilter(filterHex) {
    if (filterHex && filterHex.trim()) {
      return await this.sendCommand(`ATCRA ${filterHex.trim()}`);
    } else {
      return await this.sendCommand('ATCRA');
    }
  }

  async setFlowControl(txHex, rxHex) {
    return 'OK';
  }

  async disconnect() {
    this.isConnected = false;
    if (typeof this.onDisconnectCallback === 'function') {
      this.onDisconnectCallback();
    }
    return true;
  }

  onDisconnect(callback) {
    this.onDisconnectCallback = callback;
  }

  async send(data) {
    if (!this.isConnected) throw new Error('Simulated BLE Transport not connected');
    let cmd = '';
    if (typeof data === 'string') {
      cmd = data;
    } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const bytes = new Uint8Array(data.buffer || data);
      cmd = new TextDecoder().decode(bytes);
    }
    const resp = this.processCommand(cmd.trim());
    this.rxBuffer += resp + '\r\n>';
  }

  async sendReceive(command, timeout = 4000) {
    if (!this.isConnected) throw new Error('Simulated BLE Transport not connected');
    return this.processCommand(command.trim());
  }

  async receiveUntil(delimiter = '>', timeout = 4000) {
    if (!this.isConnected) throw new Error('Simulated BLE Transport not connected');
    const idx = this.rxBuffer.indexOf(delimiter);
    if (idx !== -1) {
      const res = this.rxBuffer.substring(0, idx + delimiter.length);
      this.rxBuffer = this.rxBuffer.substring(idx + delimiter.length);
      return res;
    }
    return '';
  }

  get currentModuleKey() {
    const map = {
      '70E': '0x09',
      '714': '0x17',
      '710': '0x19',
      '746': '0x08',
      '7E0': '0x01',
      '7E1': '0x02',
      '713': '0x03',
      '715': '0x15',
      '712': '0x44'
    };
    // Unknown headers (including the 7DF functional broadcast) address no diagnostic module,
    // exactly like a real bus: UDS requests then get no reply instead of silently hitting the BCM.
    return map[this.txHeader.toUpperCase()] || null;
  }

  getCurrentModule() {
    return this.profile.modules[this.currentModuleKey] || null;
  }

  processCommand(rawCmd) {
    const upper = rawCmd.toUpperCase().replace(/\s+/g, '');
    if (!upper) return '?';

    // 1. AT Commands
    if (upper.startsWith('ATZ') || upper === 'ATWS') return 'ELM327 v2.2';
    if (upper === 'ATE0' || upper === 'ATE1') return 'OK';
    if (upper === 'ATS0' || upper === 'ATS1') return 'OK';
    if (upper === 'ATL0' || upper === 'ATL1') return 'OK';
    if (upper === 'ATCAF0' || upper === 'ATCAF1') return 'OK';
    if (upper.startsWith('ATSP')) return 'OK';
    if (upper.startsWith('ATSH')) {
      this.txHeader = upper.substring(4);
      return 'OK';
    }
    if (upper.startsWith('ATCRA')) {
      this.rxFilter = upper.substring(5);
      return 'OK';
    }
    if (upper === 'ATDP') return 'ISO 15765-4 (CAN 11/500)';
    if (upper === 'ATDPN') return '6';
    if (upper === 'ATRV') return `${this.batteryVoltage.toFixed(1)}V`;
    if (upper.startsWith('AT')) return 'OK';

    // Physics step
    const elapsed = (Date.now() - this.startTime) / 1000;
    const cycle = elapsed % 40;
    let speed = 0;
    let rpm = this.manualRpm || (this.engineRunning ? 800 : 0);
    let boost = 0;
    let throttle = 0;

    if (this.engineRunning && !this.manualRpm) {
      if (cycle >= 5 && cycle < 12) {
        throttle = 40;
        speed = Math.round((cycle - 5) * 6);
        rpm = Math.round(1200 + (cycle - 5) * 200);
        boost = 0.8;
      } else if (cycle >= 12 && cycle < 28) {
        throttle = 25;
        speed = 52;
        rpm = 1850;
        boost = 0.4;
      } else if (cycle >= 28 && cycle < 35) {
        throttle = 0;
        speed = Math.max(0, Math.round(52 - (cycle - 28) * 8));
        rpm = Math.max(800, Math.round(1850 - (cycle - 28) * 150));
        boost = 0.0;
      }
    }

    // 2. Mode 01 PIDs
    if (upper === '0100') return '4100BE3FA813';
    if (upper === '0120') return '412080000001';
    if (upper === '010C') {
      const rawVal = Math.round(rpm * 4);
      const a = (rawVal >> 8) & 0xff;
      const b = rawVal & 0xff;
      return `410C${a.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`;
    }
    if (upper === '010D') {
      return `410D${Math.min(255, Math.max(0, speed)).toString(16).padStart(2, '0').toUpperCase()}`;
    }
    if (upper === '0105') {
      const ct = this.engineRunning ? 88 : 22;
      return `4105${(ct + 40).toString(16).padStart(2, '0').toUpperCase()}`;
    }
    if (upper === '010B') {
      const mapKpa = Math.round(101 + (boost * 100));
      return `410B${Math.min(255, mapKpa).toString(16).padStart(2, '0').toUpperCase()}`;
    }
    if (upper === '0111') {
      const th = Math.round((throttle * 255) / 100);
      return `4111${th.toString(16).padStart(2, '0').toUpperCase()}`;
    }
    if (upper === '010F') {
      return '410F40'; // 24°C
    }
    if (upper === '0123') {
      const fr = Math.round((this.engineRunning ? 320 : 0) * 10);
      const a = (fr >> 8) & 0xff;
      const b = fr & 0xff;
      return `4123${a.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`;
    }
    if (upper === '011F') {
      const rt = Math.round(elapsed);
      const a = (rt >> 8) & 0xff;
      const b = rt & 0xff;
      return `411F${a.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`;
    }
    if (upper === '0142') {
      const mv = Math.round(this.batteryVoltage * 1000);
      const a = (mv >> 8) & 0xff;
      const b = mv & 0xff;
      return `4142${a.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`;
    }
    if (upper === '015E') {
      const frLh = this.engineRunning ? Math.max(0.6, (speed * 0.06) + (rpm * 0.0004)) : 0.0;
      const raw = Math.round(frLh / 0.05);
      const a = (raw >> 8) & 0xff;
      const b = raw & 0xff;
      return `415E${a.toString(16).padStart(2, '0').toUpperCase()}${b.toString(16).padStart(2, '0').toUpperCase()}`;
    }

    // 3. Mode 09 (VIN query)
    if (upper === '0902') {
      const vin = this.profile.vin;
      const hex = Array.from(new TextEncoder().encode(vin)).map(b => b.toString(16).padStart(2, '0').toUpperCase());
      const f1 = `49 02 01 00 00 00 ${hex.slice(0, 3).join(' ')}`;
      const f2 = `49 02 02 ${hex.slice(3, 8).join(' ')}`;
      const f3 = `49 02 03 ${hex.slice(8, 13).join(' ')}`;
      const f4 = `49 02 04 ${hex.slice(13, 17).join(' ')}`;
      return `${f1}\r\n${f2}\r\n${f3}\r\n${f4}`;
    }

    // 4. Mode 03 / 04 DTCs
    if (upper === '03') return '4300';
    if (upper === '04') return '44';

    // 5. OEM VAG Telemetry DIDs
    if (upper === '221154') {
      const val = Math.round(this.dpfSootMass * 100);
      const hi = ((val >> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase();
      const lo = (val & 0xff).toString(16).padStart(2, '0').toUpperCase();
      return `62 11 54 ${hi} ${lo}`;
    }
    if (upper === '221155') {
      const val = Math.round((280.0 + 40.0) * 10);
      const hi = ((val >> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase();
      const lo = (val & 0xff).toString(16).padStart(2, '0').toUpperCase();
      return `62 11 55 ${hi} ${lo}`;
    }
    if (upper === '221156') {
      const gear = speed > 40 ? 3 : (speed > 20 ? 2 : (speed > 0 ? 1 : 0));
      return `62 11 56 ${gear.toString(16).padStart(2, '0').toUpperCase()}`;
    }

    // 6. UDS Service 0x10 & 0x3E
    if (upper === '1003') {
      this.activeSession = 0x03;
      return '50 03 00 32 01 F4';
    }
    if (upper === '1001') {
      this.activeSession = 0x01;
      return '50 01 00 32 01 F4';
    }
    if (upper === '3E80') return '';
    if (upper === '3E00') return '7E 00';

    // 7. UDS Service 0x22 (ReadDataByIdentifier)
    if (upper.startsWith('22')) {
      const did = upper.substring(2, 6);
      const mod = this.getCurrentModule();
      if (did === 'F190') {
        const hex = Array.from(new TextEncoder().encode(this.profile.vin)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
        return `62 F1 90 ${hex}`;
      }

      // If vehicle uses KWP2000, standard UDS 0x22 is unsupported (fallback to 0x1A 9B)
      if (this.profile.protocol === 'KWP2000') {
        return '7F 22 11';
      }

      if (did === 'F189') {
        const sw = (mod ? mod.swVersion : '0304');
        const hex = Array.from(new TextEncoder().encode(sw)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
        return `62 F1 89 ${hex}`;
      }
      if (did === 'F187') {
        const pn = (mod ? mod.partNumber : '7H0937087H');
        const hex = Array.from(new TextEncoder().encode(pn)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
        return `62 F1 87 ${hex}`;
      }
      if (did === '0600') {
        if (mod && mod.coding) {
          const codingHex = mod.coding.toUpperCase().match(/.{1,2}/g)?.join(' ') || mod.coding.toUpperCase();
          return `62 06 00 ${codingHex}`;
        }
        return '7F 22 31';
      }
      return '7F 22 31';
    }

    // 8. UDS Service 0x2E (WriteDataByIdentifier)
    if (upper.startsWith('2E')) {
      const did = upper.substring(2, 6);
      if (did === '0600') {
        const newCoding = upper.substring(6);
        const mod = this.getCurrentModule();
        if (mod) {
          mod.coding = newCoding;
          return '6E 06 00';
        }
      }
      return '7F 2E 31';
    }

    // 9. UDS Service 0x19 (ReadDTCInformation)
    if (upper.startsWith('19')) {
      // If vehicle uses KWP2000, UDS Service 0x19 is rejected so client falls back to 0x18
      if (this.profile.protocol === 'KWP2000') {
        return '7F 19 11';
      }
      const mod = this.getCurrentModule();
      if (!mod || !mod.dtcs || mod.dtcs.length === 0) return '59 02 CF';
      let payload = '59 02 CF';
      mod.dtcs.forEach(d => {
        if (d.code.length === 5 && !isNaN(Number(d.code))) {
          // VAG 5-digit decimal
          const dec = parseInt(d.code, 10);
          const hi = ((dec >> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase();
          const lo = (dec & 0xff).toString(16).padStart(2, '0').toUpperCase();
          const ftb = (d.ftb || 0x00).toString(16).padStart(2, '0').toUpperCase();
          const st = (d.status || 0x2f).toString(16).padStart(2, '0').toUpperCase();
          payload += ` ${hi} ${lo} ${ftb} ${st}`;
        } else {
          // UDS alphanumeric
          const cleaned = d.code.replace('B', '8').replace('P', '0').replace('C', '4').replace('U', 'C').padEnd(6, '0').substring(0, 6);
          const c1 = cleaned.substring(0, 2);
          const c2 = cleaned.substring(2, 4);
          const c3 = cleaned.substring(4, 6);
          const st = (d.status || 0x2f).toString(16).padStart(2, '0').toUpperCase();
          payload += ` ${c1} ${c2} ${c3} ${st}`;
        }
      });
      return payload;
    }

    // 10. UDS Service 0x14 (ClearDiagnosticInformation)
    if (upper.startsWith('14')) {
      if (upper === '14FFFFFF' || upper === '14FF00') {
        Object.values(this.profile.modules).forEach(m => { m.dtcs = []; });
      } else {
        const mod = this.getCurrentModule();
        if (mod) mod.dtcs = [];
      }
      return '54';
    }

    // 11. KWP2000 Services (0x18, 0x1A, 0x14)
    if (upper.startsWith('18')) {
      const mod = this.getCurrentModule();
      if (!mod || !mod.dtcs || mod.dtcs.length === 0) return '58 00';
      const countHex = mod.dtcs.length.toString(16).padStart(2, '0').toUpperCase();
      let res = `58 ${countHex}`;
      mod.dtcs.forEach(d => {
        const val = parseInt(d.code, 10) || 0x0532;
        const hi = ((val >> 8) & 0xff).toString(16).padStart(2, '0').toUpperCase();
        const lo = (val & 0xff).toString(16).padStart(2, '0').toUpperCase();
        const ftb = (d.ftb || 0x08).toString(16).padStart(2, '0').toUpperCase();
        res += ` ${hi} ${lo} ${ftb}`;
      });
      return res;
    }

    if (upper.startsWith('1A')) {
      const mod = this.getCurrentModule();
      const pn = (mod ? mod.partNumber : '7H0937049K');
      const hex = Array.from(new TextEncoder().encode(pn)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
      return `5A ${hex}`;
    }

    return `7F ${upper.substring(0, 2)} 11`;
  }
}
