import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeTransport } from './helpers.mjs';
import { UdsClient, MODULE_ARBITRATION, STANDARD_SCAN_MODULES } from '../../pwa/js/uds.js';

test('writeDataById rejects when the ECU sends no response', async () => {
  const t = new FakeTransport({ '2E 06 00 AA BB': 'NO DATA' });
  const uds = new UdsClient(t);
  await assert.rejects(() => uds.writeDataById('0600', [0xAA, 0xBB]), /no positive response|NO DATA/i);
});

test('writeDataById rejects when the response is not 6E for the requested DID', async () => {
  const t = new FakeTransport({ '2E 06 00 AA BB': '62 06 00 AA BB' });
  const uds = new UdsClient(t);
  await assert.rejects(() => uds.writeDataById('0600', [0xAA, 0xBB]), /unexpected/i);
});

test('writeDataById resolves true on a 6E <DID> positive response', async () => {
  const t = new FakeTransport({ '2E 06 00 AA BB': '6E 06 00' });
  const uds = new UdsClient(t);
  assert.equal(await uds.writeDataById('0600', [0xAA, 0xBB]), true);
});

test('sendUdsRequest uses the final message when the ECU first answers response-pending (0x78)', async () => {
  const t = new FakeTransport({ '22 F1 90': '7F 22 78\r62 F1 90 41 42' });
  const uds = new UdsClient(t);
  const res = await uds.sendUdsRequest(new Uint8Array([0x22, 0xF1, 0x90]));
  assert.deepEqual(Array.from(res), [0x62, 0xF1, 0x90, 0x41, 0x42]);
});

test('sendUdsRequest flags a lone response-pending reply as retryable rather than a hard NRC', async () => {
  const t = new FakeTransport({ '22 F1 90': '7F 22 78' });
  const uds = new UdsClient(t);
  await assert.rejects(() => uds.sendUdsRequest(new Uint8Array([0x22, 0xF1, 0x90])), (e) => e.nrc === 0x78 && e.pending === true);
});

test('securityAccess refuses to send a guessed key and never transmits 27 02', async () => {
  const t = new FakeTransport({ '27 01': '67 01 12 34' });
  const uds = new UdsClient(t);
  await assert.rejects(() => uds.securityAccess('31347'), /not supported/i);
  assert.ok(!t.sent.some(c => c.startsWith('27 02')), 'a 27 02 key must not be transmitted');
});

test('verified module arbitration IDs are unique per module', () => {
  const seen = new Map();
  for (const [addr, arb] of Object.entries(MODULE_ARBITRATION)) {
    if (!arb.verified) continue;
    const key = `${arb.tx}/${arb.rx}`;
    assert.ok(!seen.has(key), `${addr} shares CAN IDs ${key} with ${seen.get(key)}`);
    seen.set(key, addr);
  }
});

test('default auto-scan only targets modules with verified CAN IDs', () => {
  for (const addr of STANDARD_SCAN_MODULES) {
    assert.equal(MODULE_ARBITRATION[addr]?.verified, true, `${addr} is in the default scan but unverified`);
  }
});

test('setTargetModule refuses unverified modules unless explicit CAN IDs are supplied', async () => {
  const t = new FakeTransport();
  const uds = new UdsClient(t);
  const unverified = Object.entries(MODULE_ARBITRATION).find(([, a]) => !a.verified)?.[0];
  assert.ok(unverified, 'expected at least one unverified module entry');
  await assert.rejects(() => uds.setTargetModule(unverified), /unverified/i);
  await uds.setTargetModule(unverified, '7E0', '7E8');
  assert.ok(t.sent.includes('ATSH 7E0'));
});
