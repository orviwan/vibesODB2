// vibesODB2 Client-Side UDS (ISO 14229) Client

import { IsoTpAssembler } from './isotp.js';

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
  '0x09': { tx: '714', rx: '77E', name: 'Cent. Elect. (BCM)' },
  '0x17': { tx: '714', rx: '77E', name: 'Instrument Cluster' },
  '0x19': { tx: '710', rx: '77A', name: 'CAN Gateway' },
  '0x08': { tx: '714', rx: '77E', name: 'Climatronic' },
  '0x10': { tx: '714', rx: '77E', name: 'Park Distance Control' },
  '0x01': { tx: '7E0', rx: '7E8', name: 'Engine ECU' }
};

export class UdsClient {
  constructor(bleTransport) {
    this.transport = bleTransport;
    this.assembler = new IsoTpAssembler(bleTransport);
    this.activeModule = '0x09';
    this.testerPresentInterval = null;
  }

  async setTargetModule(moduleHex) {
    this.activeModule = moduleHex;
    const arb = MODULE_ARBITRATION[moduleHex] || { tx: '714', rx: '77E' };
    await this.transport.setHeader(arb.tx);
  }

  async sendUdsRequest(payloadBytes) {
    const frames = IsoTpAssembler.packetize(payloadBytes);
    let rawResponse = '';
    for (const frame of frames) {
      rawResponse = await this.transport.sendCommand(frame, 3500);
    }
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
          await this.sendUdsRequest(new Uint8Array([0x3E, 0x00]));
        }
      } catch (e) {
        // Suppress background ping error
      }
    }, 2000);
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

  async clearDtcs() {
    // 0x14 FF FF FF (Clear all DTCs)
    const res = await this.sendUdsRequest(new Uint8Array([0x14, 0xFF, 0xFF, 0xFF]));
    return res.length >= 1 && res[0] === 0x54;
  }
}
