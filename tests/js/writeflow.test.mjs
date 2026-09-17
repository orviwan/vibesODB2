import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeTransport } from './helpers.mjs';
import { UdsClient } from '../../pwa/js/uds.js';
import { SafetyPipeline } from '../../pwa/js/safety.js';
import { executeCodingWrite, canRestoreBackup } from '../../pwa/js/writeflow.js';

function setup(script) {
  const t = new FakeTransport({ '01 0C': '41 0C 00 00', '10 03': '50 03', ...script });
  const uds = new UdsClient(t);
  const safety = new SafetyPipeline(t, uds);
  return { t, uds, safety };
}
const ARGS = { vin: 'WV1ZZZ7EZEH000001', targetModule: '0x09', did: '0600', baselineCaptured: true,
  baselineBytes: new Uint8Array([0xAA, 0xBB]), modifiedBytes: new Uint8Array([0xAA, 0xBC]) };

test('write re-targets the module after the broadcast interlock so 2E never leaves on 7DF', async () => {
  const { t, uds, safety } = setup({ '2E 06 00 AA BC': '6E 06 00', '22 06 00': '62 06 00 AA BC' });
  const r = await executeCodingWrite({ udsClient: uds, safetyPipeline: safety, ...ARGS });
  assert.equal(r.success, true, JSON.stringify(r));
  const iRpm = t.sent.lastIndexOf('01 0C');
  const iHdr = t.sent.lastIndexOf('ATSH 70E');
  const iWrite = t.sent.indexOf('2E 06 00 AA BC');
  assert.ok(iRpm < iHdr && iHdr < iWrite, t.sent.join(' | '));
});

test('write reports failure (and does not rewrite) when the ECU answers with an NRC', async () => {
  const { t, uds, safety } = setup({ '2E 06 00 AA BC': '7F 2E 31' });
  const r = await executeCodingWrite({ udsClient: uds, safetyPipeline: safety, ...ARGS });
  assert.equal(r.success, false);
  assert.match(r.error, /0x31/i);
  assert.equal(t.sent.filter(c => c.startsWith('2E ')).length, 1, 'no rollback rewrite after an NRC');
});

test('write verifies by reading back and restores the baseline when the read-back differs', async () => {
  const { t, uds, safety } = setup({ '2E 06 00 AA BC': '6E 06 00', '2E 06 00 AA BB': '6E 06 00', '22 06 00': '62 06 00 AA 00' });
  const r = await executeCodingWrite({ udsClient: uds, safetyPipeline: safety, ...ARGS });
  assert.equal(r.success, false);
  assert.match(r.error, /verification/i);
  assert.equal(r.rollback?.attempted, true);
  assert.ok(t.sent.includes('2E 06 00 AA BB'), 'baseline should be re-written');
});

test('write is refused before any bus traffic when the audit fails', async () => {
  const { t, uds, safety } = setup({});
  const r = await executeCodingWrite({ udsClient: uds, safetyPipeline: safety, ...ARGS, targetModule: '0x15' });
  assert.equal(r.success, false);
  assert.ok(!t.sent.some(c => c.startsWith('2E ')));
});

test('canRestoreBackup refuses snapshots from another VIN or module', () => {
  const b = { vin: 'WV1ZZZ7EZEH000001', module_address: '0x09' };
  assert.equal(canRestoreBackup(b, 'WV1ZZZ7EZEH000001', '0x09').ok, true);
  assert.equal(canRestoreBackup(b, 'WV1ZZZ7EZEH000002', '0x09').ok, false);
  assert.equal(canRestoreBackup(b, 'WV1ZZZ7EZEH000001', '0x17').ok, false);
  assert.equal(canRestoreBackup(b, null, '0x09').ok, false, 'unknown live VIN must not restore');
});
