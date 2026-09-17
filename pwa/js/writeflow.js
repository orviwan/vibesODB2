// vibesODB2 Coding Write Flow
// Single entry point for every long-coding write. Guarantees, in order:
//   1. the safety audit runs (blacklist, live baseline, ignition/engine interlock, length, snapshot),
//   2. the target module is re-addressed AFTER the broadcast interlock (never write on 7DF),
//   3. the ECU positive response is verified,
//   4. the DID is read back and compared, with one baseline restore attempt on mismatch.
// A negative response is reported as a failure without any rewrite: an NRC means nothing changed.

function bytesEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export async function executeCodingWrite({
  udsClient,
  safetyPipeline,
  vin,
  targetModule,
  did,
  baselineBytes,
  modifiedBytes,
  baselineCaptured,
  isSimulation = false,
  simulatedRpm = 0
}) {
  const result = { success: false, error: null, audit: null, verified: false, rollback: null };

  const audit = await safetyPipeline.preWriteAudit({
    vin,
    targetModule,
    did,
    baselineHex: toHex(baselineBytes),
    modifiedHex: toHex(modifiedBytes),
    baselineCaptured,
    isSimulation,
    simulatedRpm
  });
  result.audit = audit;
  if (!audit.passed) {
    result.error = audit.errors.join('\n');
    return result;
  }

  try {
    // The interlock left the adapter on the functional 7DF header: re-target the module.
    await udsClient.setTargetModule(targetModule);
    await udsClient.enterExtendedSession();
    await udsClient.writeDataById(did, modifiedBytes);
  } catch (err) {
    result.error = `ECU write failed: ${err.message || err}. Nothing was changed on the vehicle.`;
    result.nrc = err.nrc;
    return result;
  }

  // Post-write verification.
  let readBack = null;
  try {
    readBack = await udsClient.readDataById(did);
  } catch (err) {
    result.error = `Write was acknowledged but verification read failed: ${err.message || err}. Read the coding again before making further changes.`;
    return result;
  }

  if (bytesEqual(readBack, modifiedBytes)) {
    result.success = true;
    result.verified = true;
    return result;
  }

  result.error = `Post-write verification mismatch: ECU now reports ${toHex(readBack)} but ${toHex(modifiedBytes)} was written.`;
  result.rollback = { attempted: true, ...(await safetyPipeline.executeRollback(targetModule, did, baselineBytes)) };
  result.error += result.rollback.success
    ? ' The original baseline was re-written and acknowledged.'
    : ` Automatic restore failed: ${result.rollback.message}`;
  return result;
}

/**
 * A snapshot may only be restored to the vehicle and module it was taken from.
 */
export function canRestoreBackup(backup, liveVin, targetModule) {
  const norm = (m) => {
    let k = String(m || '').trim().toLowerCase();
    if (!k.startsWith('0x')) k = '0x' + k;
    return k;
  };
  if (!liveVin) {
    return { ok: false, reason: 'The connected vehicle\'s VIN is unknown, so the snapshot cannot be matched to it.' };
  }
  if (!backup?.vin || backup.vin.toUpperCase() !== String(liveVin).toUpperCase()) {
    return { ok: false, reason: `Snapshot belongs to VIN ${backup?.vin || 'unknown'}, but the connected vehicle is ${liveVin}.` };
  }
  const bMod = norm(backup.module_address || backup.moduleAddress || backup.targetModule);
  if (bMod !== norm(targetModule)) {
    return { ok: false, reason: `Snapshot was taken from module ${bMod}, but module ${norm(targetModule)} is selected.` };
  }
  return { ok: true, reason: null };
}
