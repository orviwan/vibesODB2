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

// VAG 11-bit CAN arbitration addresses (ISO 15765-4, 500 kbit/s).
// `verified: true` means the request/response pair is documented for PQ35/PQ46/MQB and
// used by this project. Unverified entries are kept for reference only: they are excluded
// from the default auto-scan and setTargetModule() refuses them unless explicit IDs are given.
// The Python CLI table in vibesodb2/adapter/elm327.py must stay identical (tests/test_module_table.py).
export const MODULE_ARBITRATION = {
  '0x01': { tx: '7E0', rx: '7E8', name: 'Engine (ECM)', verified: true },
  '0x02': { tx: '7E1', rx: '7E9', name: 'Transmission (TCM)', verified: true },
  '0x03': { tx: '713', rx: '77D', name: 'ABS Brakes', verified: true },
  '0x08': { tx: '746', rx: '7B0', name: 'Climate Control (HVAC)', verified: true },
  '0x09': { tx: '70E', rx: '778', name: 'Cent. Elect. (BCM)', verified: true },
  '0x10': { tx: '744', rx: '7AE', name: 'Park Distance Control', verified: false },
  '0x15': { tx: '715', rx: '77F', name: 'Airbags (SRS)', verified: true },
  '0x17': { tx: '714', rx: '77E', name: 'Instrument Cluster', verified: true },
  '0x19': { tx: '710', rx: '77A', name: 'CAN Gateway', verified: true },
  '0x25': { tx: '711', rx: '77B', name: 'Immobilizer', verified: false },
  '0x44': { tx: '712', rx: '77C', name: 'Steering Assist', verified: true },
  '0x53': { tx: '746', rx: '7B0', name: 'Parking Brake (EPB)', verified: false },
  '0x56': { tx: '775', rx: '76E', name: 'Radio / Navigation', verified: false },
  '0x61': { tx: '761', rx: '769', name: 'Battery Regulation', verified: false },
  '0x76': { tx: '744', rx: '7AE', name: 'Park Distance Control', verified: false }
};

// Default auto-scan list: verified modules only.
export const STANDARD_SCAN_MODULES = Object.keys(MODULE_ARBITRATION).filter(k => MODULE_ARBITRATION[k].verified);

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
    const arb = MODULE_ARBITRATION[key];
    if (!customTx && (!arb || !arb.verified)) {
      throw new Error(`Module ${key} has unverified CAN IDs; supply explicit request/response IDs to address it.`);
    }
    this.activeModule = key;
    const tx = customTx || arb.tx;
    const rx = customRx || (customTx ? null : arb.rx);

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
    const responseBytes = await this.assembler.assembleResponse(UdsClient.dropResponsePending(rawResponse));

    if (responseBytes.length >= 3 && responseBytes[0] === UDS_SERVICES.NEGATIVE_RESPONSE) {
      const rejectedSid = responseBytes[1];
      const nrc = responseBytes[2];
      const desc = NRC_DESCRIPTIONS[nrc] || `Unknown NRC 0x${nrc.toString(16)}`;
      const err = new Error(`UDS Negative Response (NRC 0x${nrc.toString(16)}): ${desc}`);
      err.nrc = nrc;
      err.rejectedSid = rejectedSid;
      err.pending = nrc === 0x78;
      throw err;
    }

    return responseBytes;
  }

  /**
   * ELM327/STN adapters print each CAN message on its own line. An ECU that needs more time
   * first answers `7F <SID> 78` (response pending) and then sends the real reply. Keep only the
   * final message in that case; a lone 0x78 is surfaced as a retryable NRC by the caller.
   */
  static dropResponsePending(rawResponse) {
    if (!rawResponse) return rawResponse;
    const lines = rawResponse.replace(/>/g, '').split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const isPending = (l) => /^([0-9A-F]{3}\s+)?7F\s*[0-9A-F]{2}\s*78$/i.test(l.replace(/\s+/g, ' '));
    const rest = lines.filter(l => !isPending(l));
    if (rest.length === 0 || rest.length === lines.length) return rawResponse;
    return rest.join('\r');
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

    // Positive response: 0x6E <DID High> <DID Low>. Anything else is a failed write.
    if (res.length === 0) {
      throw new Error(`Write to DID 0x${didHex} received no positive response (NO DATA / timeout). Nothing was confirmed by the ECU.`);
    }
    if (res.length >= 3 && res[0] === 0x6E && res[1] === high && res[2] === low) {
      return true;
    }
    const hex = Array.from(res).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    throw new Error(`Unexpected reply to write of DID 0x${didHex}: ${hex}`);
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
        const modInfo = await this.readModuleInfo(modHex).catch(() => null);
        const modDtcs = await this.readModuleDTCs(modHex).catch(() => []);

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

  /**
   * UDS SecurityAccess (0x27) needs a seed-to-key algorithm that is ECU specific. Sending a
   * five-digit login PIN as a two-byte key is wrong and repeated bad keys trip ECU lockout timers,
   * so this client refuses unless a real key derivation function is supplied.
   */
  async securityAccess(accessKey = null, deriveKey = null) {
    if (typeof deriveKey !== 'function') {
      throw new Error('SecurityAccess is not supported: no verified seed/key algorithm is available for this module.');
    }
    const seedRes = await this.sendUdsRequest(new Uint8Array([0x27, 0x01]));
    if (seedRes.length < 2 || seedRes[0] !== 0x67) {
      throw new Error('SecurityAccess: ECU did not return a seed.');
    }
    const keyBytes = deriveKey(seedRes.slice(2), accessKey);
    const authRes = await this.sendUdsRequest(new Uint8Array([0x27, 0x02, ...keyBytes]));
    return authRes.length >= 2 && authRes[0] === 0x67;
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

  // --- Standard OBD-II odometer (SAE J1979 Mode 01 PID A6) ---
  // Only the standardised PID is used. Manufacturer-specific mileage DIDs are not read because
  // their meaning has not been verified and a wrong decode would be presented as fact.
  async readObdOdometerKm() {
    await this.transport.setHeader('7DF');
    if (this.transport.setFilter) await this.transport.setFilter(null);
    const resp = await this.transport.sendCommand('01A6', 1500);
    const parts = (resp || '').replace(/>/g, ' ').toUpperCase().split(/\s+/).filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '41' && parts[i + 1] === 'A6' && i + 5 < parts.length) {
        const [a, b, c, d] = [2, 3, 4, 5].map(k => parseInt(parts[i + k], 16));
        if ([a, b, c, d].some(Number.isNaN)) return null;
        const km = Math.round(((a << 24) | (b << 16) | (c << 8) | d) / 10.0);
        return km > 0 ? km : null;
      }
    }
    return null;
  }
}

