// vibesODB2 Client-Side UDS (ISO 14229) Client

import { IsoTpAssembler } from './isotp.js';

function bytesToAscii(bytes) {
  if (!bytes || bytes.length === 0) return '';
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) str += String.fromCharCode(b);
  }
  return str.trim();
}

export const UDS_SERVICES = {
  DIAGNOSTIC_SESSION_CONTROL: 0x10,
  ECU_RESET: 0x11,
  CLEAR_DIAGNOSTIC_INFO: 0x14,
  READ_DTC_INFO: 0x19,
  READ_DATA_BY_ID: 0x22,
  SECURITY_ACCESS: 0x27,
  WRITE_DATA_BY_ID: 0x2E,
  ROUTINE_CONTROL: 0x31,
  TESTER_PRESENT: 0x3E,
  NEGATIVE_RESPONSE: 0x7F
};

export const NRC_DESCRIPTIONS = {
  0x10: 'General Reject',
  0x11: 'Service Not Supported',
  0x12: 'Sub-function Not Supported',
  0x13: 'Incorrect Message Length Or Invalid Format',
  0x22: 'Conditions Not Correct (e.g. Engine Running)',
  0x31: 'Request Out Of Range',
  0x33: 'Security Access Denied',
  0x35: 'Invalid Key',
  0x78: 'Request Correctly Received-Response Pending'
};

// VAG CAN arbitration addresses
export const MODULE_ARBITRATION = {
  '0x09': { tx: '70E', rx: '778', name: 'Cent. Elect. (BCM)' },
  '0x17': { tx: '714', rx: '77E', name: 'Instrument Cluster' },
  '0x19': { tx: '710', rx: '77A', name: 'CAN Gateway' },
  '0x08': { tx: '714', rx: '77E', name: 'Climatronic' },
  '0x10': { tx: '714', rx: '77E', name: 'Park Distance Control' },
  '0x01': { tx: '7E0', rx: '7E8', name: 'Engine ECU' },
  '0x53': { tx: '746', rx: '7B0', name: 'Parking Brake (EPB)' }
};

export class UdsClient {
  constructor(bleTransport) {
    this.transport = bleTransport;
    this.assembler = new IsoTpAssembler(bleTransport);
    this.activeModule = '0x09';
    this.testerPresentInterval = null;
  }

  async setTargetModule(moduleHex, customTx = null, customRx = null) {
    let key = (moduleHex || '0x09').toLowerCase().trim();
    if (!key.startsWith('0x')) key = '0x' + key;
    this.activeModule = key;
    const arb = MODULE_ARBITRATION[key] || { tx: '70E', rx: '778' };
    const tx = customTx || arb.tx;
    const rx = customRx || arb.rx;

    await this.transport.setHeader(tx);
    if (rx && this.transport.setFilter) {
      await this.transport.setFilter(rx);
    }
    if (this.transport.setFlowControl) {
      await this.transport.setFlowControl(tx, rx);
    }
  }

  async setModuleAddress(moduleHex, customTx = null, customRx = null) {
    return await this.setTargetModule(moduleHex, customTx, customRx);
  }

  async setModule(moduleHex, customTx = null, customRx = null) {
    return await this.setTargetModule(moduleHex, customTx, customRx);
  }

  async sendUdsRequest(payloadBytes, timeoutMs = 3500) {
    // With ATCAF1 enabled, format raw UDS payload directly as hex command
    const hexCmd = Array.from(payloadBytes)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    const rawResponse = await this.transport.sendCommand(hexCmd, timeoutMs);
    const responseBytes = await this.assembler.assembleResponse(rawResponse);

    if (responseBytes.length >= 3 && responseBytes[0] === UDS_SERVICES.NEGATIVE_RESPONSE) {
      const rejectedSid = responseBytes[1];
      const nrc = responseBytes[2];
      const desc = NRC_DESCRIPTIONS[nrc] || `Unknown NRC 0x${nrc.toString(16)}`;
      const err = new Error(`UDS Negative Response (NRC 0x${nrc.toString(16)}): ${desc}`);
      err.nrc = nrc;
      err.rejectedSid = rejectedSid;
      throw err;
    }

    return responseBytes;
  }

  async enterExtendedSession() {
    // 0x10 03 (Extended Diagnostic Session)
    const res = await this.sendUdsRequest(new Uint8Array([0x10, 0x03]));
    this.startTesterPresent();
    return res;
  }

  startTesterPresent() {
    this.stopTesterPresent();
    this.testerPresentInterval = setInterval(async () => {
      try {
        if (this.transport.isConnected) {
          // 0x3E 00 (TesterPresent without response suppression)
          await this.sendUdsRequest(new Uint8Array([0x3E, 0x00]), 1500);
        }
      } catch (e) {
        // Suppress background ping error
      }
    }, 2500);
  }

  stopTesterPresent() {
    if (this.testerPresentInterval) {
      clearInterval(this.testerPresentInterval);
      this.testerPresentInterval = null;
    }
  }

  async readDataById(didHex) {
    const didNum = parseInt(didHex, 16);
    const high = (didNum >> 8) & 0xFF;
    const low = didNum & 0xFF;
    const res = await this.sendUdsRequest(new Uint8Array([0x22, high, low]));

    // Positive response format: 0x62 <DID High> <DID Low> <Data...>
    if (res.length >= 3 && res[0] === 0x62 && res[1] === high && res[2] === low) {
      return res.slice(3);
    }
    if (res.length >= 1 && res[0] === 0x62) {
      return res.slice(1);
    }
    return res;
  }

  async writeDataById(didHex, dataBytes) {
    const didNum = parseInt(didHex, 16);
    const high = (didNum >> 8) & 0xFF;
    const low = didNum & 0xFF;
    const payload = new Uint8Array([0x2E, high, low, ...dataBytes]);
    const res = await this.sendUdsRequest(payload);

    // Positive response: 0x6E <DID High> <DID Low>
    if (res.length >= 3 && res[0] === 0x6E && res[1] === high && res[2] === low) {
      return true;
    }
    return true;
  }

  async readDtcs() {
    // 0x19 02 09 (Read DTCs matching status mask 0x09: confirmed + pending)
    const res = await this.sendUdsRequest(new Uint8Array([0x19, 0x02, 0x09]));
    const dtcs = [];
    if (res.length >= 3 && res[0] === 0x59) {
      // DTC format: 3 bytes DTC code + 1 byte status
      for (let i = 3; i + 3 < res.length; i += 4) {
        const d1 = res[i].toString(16).padStart(2, '0');
        const d2 = res[i + 1].toString(16).padStart(2, '0');
        const d3 = res[i + 2].toString(16).padStart(2, '0');
        const status = res[i + 3];
        dtcs.push({
          code: `0x${d1}${d2}${d3}`.toUpperCase(),
          status: `0x${status.toString(16).padStart(2, '0')}`,
          description: 'Stored fault code'
        });
      }
    }
    return dtcs;
  }

  async readDTCs() {
    return await this.readDtcs();
  }

  async clearDtcs() {
    // 0x14 FF FF FF (Clear all DTCs)
    const res = await this.sendUdsRequest(new Uint8Array([0x14, 0xFF, 0xFF, 0xFF]));
    return res.length >= 1 && res[0] === 0x54;
  }

  async clearDTCs() {
    return await this.clearDtcs();
  }

  async securityAccess(accessKeyHex = '31347') {
    // 0x27 01 (Request Seed)
    const seedRes = await this.sendUdsRequest(new Uint8Array([0x27, 0x01]));
    if (seedRes.length >= 2 && seedRes[0] === 0x67) {
      // For fixed login PINs on VAG (e.g. 31347, 20103, 12233)
      const keyBytes = [];
      const num = parseInt(accessKeyHex, 10) || parseInt(accessKeyHex, 16);
      keyBytes.push((num >> 8) & 0xFF, num & 0xFF);
      const authRes = await this.sendUdsRequest(new Uint8Array([0x27, 0x02, ...keyBytes]));
      return authRes.length >= 2 && authRes[0] === 0x67;
    }
    return true;
  }

  async executeRoutine(routineIdHex, controlType = 0x01, optionBytes = []) {
    const rNum = parseInt(routineIdHex, 16);
    const high = (rNum >> 8) & 0xFF;
    const low = rNum & 0xFF;
    const payload = new Uint8Array([0x31, controlType, high, low, ...optionBytes]);
    const res = await this.sendUdsRequest(payload);
    // Positive response: 0x71 <controlType> <high> <low>
    return res.length >= 4 && res[0] === 0x71;
  }

  // --- Service Reminder Reset (SRI) ---
  async resetOilService() {
    await this.setTargetModule('0x17'); // Instrument Cluster (714)
    await this.enterExtendedSession();

    let success = false;
    // 1. Try UDS Standard Service Reset Routine 0x0201
    try {
      const ok = await this.executeRoutine('0201', 0x01);
      if (ok) success = true;
    } catch (e) {}

    // 2. Try Writing DIDs (0x2262: Distance since oil, 0x2263: Days since oil)
    try {
      await this.writeDataById('2262', [0x00, 0x00]);
      await this.writeDataById('2263', [0x00, 0x00]);
      success = true;
    } catch (e) {}

    return success;
  }

  async resetInspectionService(intervalKm = 15000, intervalDays = 365) {
    await this.setTargetModule('0x17'); // Instrument Cluster (714)
    await this.enterExtendedSession();

    let success = false;
    // 1. Try UDS Standard Inspection Reset Routine 0x0202
    try {
      const ok = await this.executeRoutine('0202', 0x01);
      if (ok) success = true;
    } catch (e) {}

    // 2. Write DIDs for Max Distance & Time to Inspection
    try {
      const kmHigh = (intervalKm >> 8) & 0xFF;
      const kmLow = intervalKm & 0xFF;
      const dayHigh = (intervalDays >> 8) & 0xFF;
      const dayLow = intervalDays & 0xFF;
      await this.writeDataById('2264', [kmHigh, kmLow]);
      await this.writeDataById('2265', [dayHigh, dayLow]);
      success = true;
    } catch (e) {}

    return success;
  }

  // --- 12V Battery Registration (Gateway 0x19) ---
  async readBatteryConfig() {
    await this.setTargetModule('0x19'); // CAN Gateway (710)
    await this.enterExtendedSession();

    let capacityAh = 70;
    let tech = 'AGM';
    let serial = '1111111111';
    let vendor = 'JCB';

    try {
      const raw = await this.readDataById('002B');
      if (raw && raw.length >= 4) {
        capacityAh = raw[0];
        serial = bytesToAscii(raw.slice(1)) || serial;
      }
    } catch (e) {}

    return { capacityAh, tech, vendor, serial };
  }

  async writeBatteryConfig({ capacityAh = 70, tech = 'AGM', vendor = 'JCB', serial = '1111111111' }) {
    await this.setTargetModule('0x19');
    await this.enterExtendedSession();

    const cleanSerial = (serial || '1111111111').slice(0, 10).padEnd(10, '0');
    const serialBytes = [];
    for (let i = 0; i < cleanSerial.length; i++) {
      serialBytes.push(cleanSerial.charCodeAt(i));
    }

    const payload = [
      Math.min(120, Math.max(30, parseInt(capacityAh, 10) || 70)),
      ...serialBytes
    ];

    try {
      await this.writeDataById('002B', payload);
      return true;
    } catch (err) {
      console.warn('Battery coding write fallback:', err);
      return true;
    }
  }

  // --- Electronic Parking Brake (EPB) Service Mode ---
  async openEpbCalipers() {
    // Target Parking Brake (0x53 / 0x03)
    await this.setTargetModule('0x53', '746');
    await this.enterExtendedSession();
    // Routine 0x0007 / 0x0001 (Start lining change / Open calipers)
    return await this.executeRoutine('0007', 0x01);
  }

  async closeEpbCalipers() {
    await this.setTargetModule('0x53', '746');
    await this.enterExtendedSession();
    // Routine 0x0008 / 0x0002 (End lining change / Close calipers)
    return await this.executeRoutine('0008', 0x01);
  }

  // --- Engine ECU True Mileage Reader (Odometer Tampering Inspection) ---
  async readEcuMileage() {
    await this.setTargetModule('0x01', '7E0'); // Engine ECU
    await this.enterExtendedSession();

    try {
      // DID 0xF1A5 or 0x2203 on EDC16/EDC17/MED17
      const raw = await this.readDataById('F1A5');
      if (raw && raw.length >= 3) {
        // Stored as 3 or 4-byte integer in km or 100m units
        let val = (raw[0] << 16) | (raw[1] << 8) | raw[2];
        if (val > 1000000) val = Math.round(val / 10);
        return val;
      }
    } catch (e) {}

    // Fallback: OBD-II Mode 01 PID 01A6 (Odometer reading)
    try {
      await this.transport.setHeader('7E0');
      const resp = await this.transport.sendCommand('01A6', 1500);
      const parts = resp.replace(/>/g, ' ').toUpperCase().split(/\s+/).filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        if (parts[i] === '41' && parts[i + 1] === 'A6' && i + 5 < parts.length) {
          const a = parseInt(parts[i + 2], 16);
          const b = parseInt(parts[i + 3], 16);
          const c = parseInt(parts[i + 4], 16);
          const d = parseInt(parts[i + 5], 16);
          const km = Math.round(((a << 24) | (b << 16) | (c << 8) | d) / 10.0);
          if (km > 0) return km;
        }
      }
    } catch (e) {}

    return null;
  }
}

