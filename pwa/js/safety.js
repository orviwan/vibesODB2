// vibesODB2 Client-Side Defensive Safety Pipeline & Guardrails

import { saveBackup } from './storage.js';

export const BLACKLISTED_MODULES = {
  '0x03': 'Brake / ABS / ESP Stability Control',
  '0x15': 'Airbag & Occupant Restraint Safety Systems',
  '0x44': 'Electromechanical Power Steering (EPS)'
};

export class SafetyPipeline {
  constructor(bleTransport, udsClient) {
    this.transport = bleTransport;
    this.uds = udsClient;
  }

  /**
   * Performs pre-write validation before sending any UDS 0x2E payload.
   */
  async preWriteAudit({
    vin,
    targetModule,
    did,
    baselineHex,
    modifiedHex,
    baselineCaptured = false,
    isSimulation = false,
    simulatedRpm = 0
  }) {
    const auditReport = {
      passed: false,
      checks: [],
      error: null,
      errors: []
    };
    const fail = (name, reason) => {
      auditReport.checks.push({ name, passed: false, detail: reason });
      auditReport.error = reason;
      auditReport.errors.push(reason);
      return auditReport;
    };

    // Guardrail 0: A live baseline must have been read from this vehicle. Writing the bundled
    // demo coding (or a buffer from another car) to a real ECU is never acceptable.
    if (!baselineCaptured) {
      return fail('Live Baseline Captured', 'No live coding baseline has been read from this vehicle yet. Use "Read Live Coding" first so the write is based on the real ECU state.');
    }
    auditReport.checks.push({ name: 'Live Baseline Captured', passed: true, detail: 'Write is based on coding read from this vehicle.' });

    // Guardrail 1: Critical Module Blacklist Check
    const normalizedMod = SafetyPipeline.normalizeModule(targetModule);
    if (BLACKLISTED_MODULES[normalizedMod]) {
      return fail('Module Blacklist', `Security Violation: Module ${normalizedMod} (${BLACKLISTED_MODULES[normalizedMod]}) is strictly blacklisted to protect vehicle safety.`);
    }
    auditReport.checks.push({
      name: 'Critical Module Blacklist',
      passed: true,
      detail: `Module ${targetModule} is safe for convenience coding.`
    });

    // Guardrail 2: Engine Running Interlock (PID 01 0C)
    let rpm = 0;
    let busResponsive = false;
    if (isSimulation) {
      rpm = simulatedRpm;
      busResponsive = true;
    } else {
      try {
        // Functional broadcast for OBD-II Mode 01. The RX filter set for the last module
        // would hide the engine ECU's 7E8 reply, so clear it first. The caller MUST re-target
        // the module before any further UDS traffic.
        if (this.transport.setFilter) await this.transport.setFilter(null);
        await this.transport.setHeader('7DF');
        const res = await this.transport.sendCommand('01 0C', 2000);
        const clean = (res || '').toUpperCase();
        // Format: 41 0C A B -> RPM = ((A * 256) + B) / 4
        const parts = clean.split(/\s+/);
        const idx = parts.indexOf('41');
        if (idx !== -1 && parts[idx + 1] === '0C') {
          const a = parseInt(parts[idx + 2], 16);
          const b = parseInt(parts[idx + 3], 16);
          if (Number.isNaN(a) || Number.isNaN(b)) {
            return fail('Ignition & Engine State Interlock', `Engine Interlock: RPM reply was truncated ("${clean.trim()}"). Cannot confirm the engine is off; write refused.`);
          }
          rpm = ((a * 256) + b) / 4.0;
          busResponsive = true;
        } else if (!clean.includes('NO DATA') && !clean.includes('UNABLE') && !clean.includes('ERROR') && !clean.includes('?')) {
          busResponsive = true;
        }
      } catch (e) {
        busResponsive = false;
      }
    }

    if (!busResponsive) {
      return fail('Ignition & Engine State Interlock', 'Ignition State Interlock: Vehicle bus did not respond. Vehicle ignition is OFF (Terminal 15 inactive). Switch ignition key to ON (Position 2, dash lights on, engine OFF) before modifying vehicle coding.');
    }

    if (rpm > 0) {
      return fail('Ignition & Engine State Interlock', `Engine Running Interlock: Vehicle RPM is ${Math.round(rpm)} RPM. Writing configuration while engine is running is strictly prohibited! Turn engine OFF (Ignition ON only).`);
    }
    auditReport.checks.push({
      name: 'Ignition & Engine State Interlock',
      passed: true,
      detail: 'Ignition is ON and Engine is OFF (0 RPM confirmed).'
    });

    // Guardrail 3: Strict Byte Payload Sizing
    const baseBytes = baselineHex.replace(/\s+/g, '').length / 2;
    const modBytes = modifiedHex.replace(/\s+/g, '').length / 2;
    if (baseBytes !== modBytes) {
      return fail('Payload Length Verification', `Payload Length Mismatch: Original configuration is ${baseBytes} bytes, but modified payload is ${modBytes} bytes. Length must match exactly.`);
    }
    auditReport.checks.push({
      name: 'Payload Length Verification',
      passed: true,
      detail: `Strict size match (${baseBytes} bytes).`
    });

    // Guardrail 4: Mandatory Snapshot Table Record
    try {
      const backup = await saveBackup({
        vin,
        moduleAddress: targetModule,
        did: did || '0600',
        rawHex: baselineHex,
        notes: `Pre-write safety snapshot before writing to ${targetModule}`
      });
      auditReport.checks.push({
        name: 'Pre-Write Snapshot Table',
        passed: true,
        detail: `Immutable backup saved to local storage (ID: #${backup.id}).`
      });
    } catch (e) {
      return fail('Pre-Write Snapshot Table', `Failed to create required pre-write snapshot: ${e.message}`);
    }

    // Guardrail 5: Post-write verification. After the ECU acknowledges the write, the DID is read
    // back and compared; on mismatch one restore of the baseline is attempted (see writeflow.js).
    auditReport.checks.push({
      name: 'Post-Write Verification',
      passed: true,
      detail: 'Coding will be read back after writing; the baseline is re-written once if the read-back differs.'
    });

    auditReport.passed = true;
    return auditReport;
  }

  static normalizeModule(moduleHex) {
    let key = String(moduleHex || '').trim().toLowerCase();
    if (!key.startsWith('0x')) key = '0x' + key;
    return key;
  }

  /**
   * Re-writes the baseline coding. Used only when a post-write read-back does not match what was
   * written; it is NOT used after a negative response, because an NRC means nothing was changed.
   */
  async executeRollback(targetModule, did, originalBytes) {
    try {
      await this.uds.setTargetModule(targetModule);
      await this.uds.enterExtendedSession();
      await this.uds.writeDataById(did, originalBytes);
      return { success: true, message: 'Baseline restored: original coding re-written and acknowledged by the ECU.' };
    } catch (err) {
      return { success: false, message: `Rollback failed: ${err.message}. Please use Manual Restore from Backups.` };
    }
  }
}
