// vibesODB2 Client-Side UDS (ISO 14229) & KWP2000 Diagnostic Client

import { IsoTpAssembler } from './isotp.js';
import { lookupDtc } from './dtc_db.js';

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
  '0x01': { tx: '7E0', rx: '7E8', name: 'Engine (ECM)' },
  '0x02': { tx: '7E1', rx: '7E9', name: 'Transmission (TCM)' },
  '0x03': { tx: '713', rx: '77D', name: 'ABS Brakes' },
  '0x08': { tx: '714', rx: '77E', name: 'Climatronic / HVAC' },
  '0x09': { tx: '70E', rx: '778', name: 'Cent. Elect. (BCM)' },
  '0x10': { tx: '744', rx: '7AE', name: 'Park Distance Control' },
  '0x15': { tx: '715', rx: '77F', name: 'Airbags (SRS)' },
  '0x17': { tx: '714', rx: '77E', name: 'Instrument Cluster' },
  '0x19': { tx: '710', rx: '77A', name: 'CAN Gateway' },
  '0x25': { tx: '714', rx: '77E', name: 'Immobilizer' },
  '0x44': { tx: '712', rx: '77C', name: 'Steering Assist' },
  '0x53': { tx: '746', rx: '7B0', name: 'Parking Brake (EPB)' },
  '0x56': { tx: '775', rx: '76E', name: 'Radio / Navigation' },
  '0x61': { tx: '761', rx: '769', name: 'Battery Regulation' },
  '0x76': { tx: '744', rx: '7AE', name: 'Park Distance Control' }
};

export const STANDARD_SCAN_MODULES = [
  '0x01', // Engine
  '0x02', // Transmission
  '0x03', // ABS Brakes
  '0x08', // Auto HVAC
  '0x09', // Cent. Elect. (BCM)
  '0x15', // Airbags
  '0x17', // Instrument Cluster
  '0x19', // CAN Gateway
  '0x44', // Steering Assist
  '0x53'  // Parking Brake (EPB)
];

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

  /**
   * Reads identification data (Part Number, Component name) from target module.
   */
  async readModuleInfo(moduleHex = null) {
    if (moduleHex) {
      await this.setTargetModule(moduleHex);
    }
    const info = {
      address: this.activeModule,
      name: MODULE_ARBITRATION[this.activeModule]?.name || `Module ${this.activeModule}`,
      partNumber: null,
      component: null,
      coding: null,
      protocol: 'UDS'
    };

    // 1. Try UDS DID 0xF187 (Spare Part Number)
    try {
      const partRes = await this.readDataById('F187');
      if (partRes && partRes.length > 0) {
        info.partNumber = bytesToAscii(partRes);
      }
    } catch (_) {}

    // Fallback: Try DID 0xF191 (ECU Hardware Number)
    if (!info.partNumber) {
      try {
        const hwRes = await this.readDataById('F191');
        if (hwRes && hwRes.length > 0) {
          info.partNumber = bytesToAscii(hwRes);
        }
      } catch (_) {}
    }

    // Try DID 0xF197 (System Name / Component)
    try {
      const sysRes = await this.readDataById('F197');
      if (sysRes && sysRes.length > 0) {
        info.component = bytesToAscii(sysRes);
      }
    } catch (_) {}

    // Fallback: Try DID 0xF189 (Software Version)
    if (!info.component) {
      try {
        const swRes = await this.readDataById('F189');
        if (swRes && swRes.length > 0) {
          info.component = `SW: ${bytesToAscii(swRes)}`;
        }
      } catch (_) {}
    }

    // 2. Older KWP2000 identification fallback (if UDS returned nothing)
    if (!info.partNumber) {
      try {
        // KWP Service 0x1A 9B (Read ECU Identification)
        const kwpRes = await this.sendUdsRequest(new Uint8Array([0x1A, 0x9B]), 1200);
        if (kwpRes && kwpRes.length >= 2 && kwpRes[0] === 0x5A) {
          info.protocol = 'KWP2000';
          info.partNumber = bytesToAscii(kwpRes.slice(2));
        }
      } catch (_) {}
    }

    return info;
  }

  /**
   * Reads Diagnostic Trouble Codes from target module using dual UDS & KWP2000 protocols.
   */
  async readModuleDTCs(moduleHex = null) {
    if (moduleHex) {
      await this.setTargetModule(moduleHex);
    }
    const dtcs = [];

    // Protocol 1: Modern UDS Service 0x19 02 09 (or 0x19 02 FF)
    try {
      const res = await this.sendUdsRequest(new Uint8Array([0x19, 0x02, 0x09]), 1500);
      if (res && res.length >= 3 && res[0] === 0x59) {
        // DTC format: 3 bytes DTC code + 1 byte status
        for (let i = 3; i + 3 < res.length; i += 4) {
          const d1 = res[i].toString(16).padStart(2, '0');
          const d2 = res[i + 1].toString(16).padStart(2, '0');
          const d3 = res[i + 2].toString(16).padStart(2, '0');
          const status = res[i + 3];

          // Check if this is a standard 16-bit VAG code or SAE P-code
          const hex16 = (res[i] << 8) | res[i + 1];
          const rawCode = `0x${d1}${d2}${d3}`.toUpperCase();
          const parsed = lookupDtc(hex16 <= 0xFFFF ? hex16 : rawCode, status, res[i + 2]);

          dtcs.push({
            code: parsed.code,
            rawHex: rawCode,
            title: parsed.title,
            system: parsed.system,
            meaning: parsed.meaning,
            causes: parsed.causes,
            fixes: parsed.fixes,
            severity: parsed.severity,
            symptom: parsed.symptom,
            symptomDetail: parsed.symptomDetail,
            statusMask: `0x${status.toString(16).padStart(2, '0').toUpperCase()}`,
            isConfirmed: (status & 0x08) !== 0,
            isPending: (status & 0x04) !== 0,
            isStatic: (status & 0x01) !== 0,
            protocol: 'UDS'
          });
        }
        return dtcs;
      }
    } catch (udsErr) {
      // If UDS is rejected or unsupported, proceed to KWP2000
    }

    // Protocol 2: Older KWP2000 Service 0x18 00 FF 00 (Read DTCs by Status)
    try {
      const kwpRes = await this.sendUdsRequest(new Uint8Array([0x18, 0x00, 0xFF, 0x00]), 1500);
      if (kwpRes && kwpRes.length >= 2 && kwpRes[0] === 0x58) {
        const dtcCount = kwpRes[1];
        // Each DTC in KWP is 3 bytes: 2 bytes VAG Decimal Code + 1 byte Symptom/Status
        for (let i = 2; i + 2 < kwpRes.length && (dtcs.length < dtcCount || dtcCount === 0xFF); i += 3) {
          const high = kwpRes[i];
          const low = kwpRes[i + 1];
          const symptom = kwpRes[i + 2];
          const decCode = (high << 8) | low;

          if (decCode > 0) {
            const parsed = lookupDtc(decCode, null, symptom);
            dtcs.push({
              code: parsed.code,
              rawHex: `0x${high.toString(16).padStart(2, '0')}${low.toString(16).padStart(2, '0')}`.toUpperCase(),
              title: parsed.title,
              system: parsed.system,
              meaning: parsed.meaning,
              causes: parsed.causes,
              fixes: parsed.fixes,
              severity: parsed.severity,
              symptom: parsed.symptom,
              symptomDetail: parsed.symptomDetail,
              statusMask: `0x${symptom.toString(16).padStart(2, '0').toUpperCase()}`,
              isConfirmed: true,
              isPending: false,
              isStatic: (symptom & 0x80) !== 0 || !parsed.symptom?.includes('Intermittent'),
              protocol: 'KWP2000'
            });
          }
        }
        return dtcs;
      }
    } catch (kwpErr) {}

    return dtcs;
  }

  /**
   * Backwards compatible readDTCs
   */
  async readDtcs() {
    return await this.readModuleDTCs(this.activeModule);
  }

  async readDTCs() {
    return await this.readDtcs();
  }

  /**
   * Sweeps across standard vehicle modules to perform a comprehensive Auto-Scan.
   * 
   * @param {Function} [onProgress] - Callback: ({ moduleHex, moduleName, index, total, status })
   * @param {Array<string>} [moduleList] - List of hex module addresses to scan
   * @returns {Promise<object>} Auto-Scan summary with detected modules and faults
   */
  async autoScanVehicle(onProgress = null, moduleList = null) {
    const targets = moduleList && moduleList.length > 0 ? moduleList : STANDARD_SCAN_MODULES;
    const results = {
      modules: [],
      totalDtcCount: 0,
      scannedCount: 0,
      timestamp: new Date().toISOString()
    };

    for (let i = 0; i < targets.length; i++) {
      const modHex = targets[i];
      const modMeta = MODULE_ARBITRATION[modHex] || { name: `Module ${modHex}` };

      if (onProgress) {
        onProgress({
          moduleHex: modHex,
          moduleName: modMeta.name,
          index: i + 1,
          total: targets.length,
          status: `Scanning ${modMeta.name}...`
        });
      }

      try {
        await this.setTargetModule(modHex);
        const [info, dtcs] = await Promise.allSettled([
          this.readModuleInfo(modHex),
          this.readModuleDTCs(modHex)
        ]);

        const modInfo = info.status === 'fulfilled' ? info.value : null;
        const modDtcs = dtcs.status === 'fulfilled' ? dtcs.value : [];

        // If module responded with info or DTCs, consider it installed
        const isResponding = !!(modInfo?.partNumber || modInfo?.component || modDtcs.length > 0);

        if (isResponding) {
          results.modules.push({
            address: modHex,
            name: modMeta.name,
            partNumber: modInfo?.partNumber || 'Available',
            component: modInfo?.component || 'VAG Electronic Control Unit',
            coding: modInfo?.coding || null,
            protocol: modInfo?.protocol || 'ISO 15765-4',
            dtcs: modDtcs
          });
          results.totalDtcCount += modDtcs.length;
        }
      } catch (err) {
        // Module not installed or did not respond on bus
      }
      results.scannedCount++;
    }

    return results;
  }

  /**
   * Clears diagnostic trouble codes for a specific module.
   */
  async clearModuleDTCs(moduleHex) {
    await this.setTargetModule(moduleHex);
    // 1. Try UDS Service 0x14 FF FF FF
    try {
      const res = await this.sendUdsRequest(new Uint8Array([0x14, 0xFF, 0xFF, 0xFF]));
      if (res.length >= 1 && res[0] === 0x54) return true;
    } catch (_) {}

    // 2. Try KWP2000 Service 0x14 FF 00
    try {
      const kwpRes = await this.sendUdsRequest(new Uint8Array([0x14, 0xFF, 0x00]));
      if (kwpRes.length >= 1 && kwpRes[0] === 0x54) return true;
    } catch (_) {}

    return false;
  }

  async clearDtcs() {
    return await this.clearModuleDTCs(this.activeModule);
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

  // --- 12V Battery Registration (Gateway 0x19 / Module 0x61) ---
  async readBatteryConfig() {
    // 1. Try CAN Gateway 0x19
    await this.setTargetModule('0x19');
    await this.enterExtendedSession();

    let capacityAh = null;
    let tech = null;
    let vendor = null;
    let serial = null;
    let foundAny = false;

    // Check MQB separate adaptation DIDs:
    // 0x0E0C = Capacity, 0x0E0D = Tech, 0x0E0E = Vendor, 0x0E0F = Serial
    try {
      const capRaw = await this.readDataById('0E0C');
      if (capRaw && capRaw.length > 0) {
        foundAny = true;
        const str = bytesToAscii(capRaw);
        const match = str.match(/\d+/);
        if (match) {
          capacityAh = parseInt(match[0], 10);
        } else if (capRaw.length >= 2) {
          capacityAh = (capRaw[0] << 8) | capRaw[1];
        } else if (capRaw.length === 1) {
          capacityAh = capRaw[0];
        }
      }
    } catch (e) {}

    try {
      const techRaw = await this.readDataById('0E0D');
      if (techRaw && techRaw.length > 0) {
        foundAny = true;
        const tStr = bytesToAscii(techRaw).toUpperCase();
        if (tStr.includes('AGM') || tStr.includes('FLEECE')) tech = 'AGM';
        else if (tStr.includes('EFB')) tech = 'EFB';
        else if (tStr.includes('GEL')) tech = 'GEL';
        else if (tStr.includes('WET') || tStr.includes('NASS')) tech = 'WET';
      }
    } catch (e) {}

    try {
      const venRaw = await this.readDataById('0E0E');
      if (venRaw && venRaw.length > 0) {
        foundAny = true;
        vendor = bytesToAscii(venRaw).slice(0, 3).toUpperCase();
      }
    } catch (e) {}

    try {
      const serRaw = await this.readDataById('0E0F');
      if (serRaw && serRaw.length > 0) {
        foundAny = true;
        serial = bytesToAscii(serRaw).slice(0, 10);
      }
    } catch (e) {}

    // Check Combined DIDs if separate DIDs not present: 0x0607, 0x2A00, 0x002B
    if (!foundAny) {
      for (const cDid of ['0607', '2A00', '1A02', '002B']) {
        try {
          const raw = await this.readDataById(cDid);
          if (raw && raw.length >= 4) {
            foundAny = true;
            capacityAh = raw[0];
            const asc = bytesToAscii(raw.slice(1));
            if (asc.length >= 10) serial = asc.slice(0, 10);
            break;
          }
        } catch (e) {}
      }
    }

    // If still not found, check Module 0x61 (Battery Regulation on PQ platforms / T5 / T6)
    if (!foundAny) {
      try {
        await this.setTargetModule('0x61', '761', '769');
        await this.enterExtendedSession();
        const raw61 = await this.readDataById('0001');
        if (raw61 && raw61.length >= 4) {
          foundAny = true;
          capacityAh = raw61[0];
          serial = bytesToAscii(raw61.slice(1)) || serial;
        }
      } catch (e) {}
    }

    if (!foundAny) {
      const notSupportedErr = new Error("Battery monitoring channels not found in Gateway (0x19). Your vehicle might not have a J367 Battery Monitoring Sensor (standard on models without Start-Stop / energy recuperation).");
      notSupportedErr.unsupported = true;
      throw notSupportedErr;
    }

    return {
      capacityAh: capacityAh || 70,
      tech: tech || 'AGM',
      vendor: vendor || 'JCB',
      serial: serial || '1111111111'
    };
  }

  async writeBatteryConfig({ capacityAh = 70, tech = 'AGM', vendor = 'JCB', serial = '1111111111' }) {
    await this.setTargetModule('0x19');
    await this.enterExtendedSession();

    // 1. Attempt Security Access with VAG Gateway Login 20103
    try {
      await this.securityAccess('20103');
    } catch (secErr) {
      console.warn('Gateway Security Access login notice:', secErr);
    }

    const cleanCap = Math.min(120, Math.max(30, parseInt(capacityAh, 10) || 70));
    const cleanTech = (tech || 'AGM').toUpperCase();
    const cleanVendor = (vendor || 'JCB').slice(0, 3).padEnd(3, ' ').toUpperCase();
    const cleanSerial = (serial || '1111111111').slice(0, 10).padEnd(10, '0');

    let writeSuccess = false;
    let lastError = null;

    // A. Try MQB separate DIDs (0x0E0C to 0x0E0F)
    try {
      // 0x0E0C: Capacity (2 ASCII digits or integer)
      const capBytes = Array.from(cleanCap.toString().padStart(3, '0')).map(c => c.charCodeAt(0));
      await this.writeDataById('0E0C', capBytes);

      // 0x0E0D: Tech (Fleece/AGM, EFB, Wet, Gel)
      const techStr = cleanTech === 'AGM' ? 'Fleece' : cleanTech;
      const techBytes = Array.from(techStr).map(c => c.charCodeAt(0));
      await this.writeDataById('0E0D', techBytes);

      // 0x0E0E: Vendor
      const venBytes = Array.from(cleanVendor).map(c => c.charCodeAt(0));
      await this.writeDataById('0E0E', venBytes);

      // 0x0E0F: Serial
      const serBytes = Array.from(cleanSerial).map(c => c.charCodeAt(0));
      await this.writeDataById('0E0F', serBytes);

      writeSuccess = true;
    } catch (e) {
      lastError = e;
    }

    // B. Try Combined DIDs if separate did not succeed
    if (!writeSuccess) {
      const serialBytes = Array.from(cleanSerial).map(c => c.charCodeAt(0));
      const venBytes = Array.from(cleanVendor).map(c => c.charCodeAt(0));
      const combinedPayload = [cleanCap, ...venBytes, ...serialBytes];

      for (const cDid of ['0607', '2A00', '1A02', '002B']) {
        try {
          await this.writeDataById(cDid, combinedPayload);
          writeSuccess = true;
          break;
        } catch (e) {
          lastError = e;
        }
      }
    }

    // C. Try Module 0x61 if Gateway 0x19 did not accept
    if (!writeSuccess) {
      try {
        await this.setTargetModule('0x61', '761', '769');
        await this.enterExtendedSession();
        const serialBytes = Array.from(cleanSerial).map(c => c.charCodeAt(0));
        await this.writeDataById('0001', [cleanCap, ...serialBytes]);
        writeSuccess = true;
      } catch (e) {
        lastError = e;
      }
    }

    if (!writeSuccess) {
      const isNrc31 = lastError && (lastError.nrc === 0x31 || lastError.message?.includes('0x31'));
      const isNrc33 = lastError && (lastError.nrc === 0x33 || lastError.message?.includes('0x33'));

      if (isNrc31) {
        throw new Error("Vehicle Gateway rejected battery coding (NRC 0x31: Out of Range). Your vehicle likely does NOT have a J367 Battery Monitoring Sensor (standard on models without Start-Stop). Battery registration is not needed on this vehicle.");
      } else if (isNrc33) {
        throw new Error("Security Access Denied (NRC 0x33). The CAN Gateway did not accept programming access code 20103.");
      } else {
        throw new Error(lastError ? lastError.message : "CAN Gateway rejected battery adaptation write.");
      }
    }

    return true;
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

