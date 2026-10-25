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

test('readModuleDTCs on Engine (0x01) decodes SAE P-codes instead of bogus decimal integers and never uses 7DF', async () => {
  const t = new FakeTransport({
    '19 02 09': '59 02 CF 01 01 00 2F 20 15 00 28',
    '03': '43 00',
    '07': '47 00'
  });
  const uds = new UdsClient(t);
  const dtcs = await uds.readModuleDTCs('0x01');

  assert.ok(!t.sent.some(c => c.includes('7DF')), 'must not switch to 7DF functional broadcast header');
  const codes = dtcs.map(d => d.code);
  assert.ok(codes.includes('P0101'), `expected P0101, got ${JSON.stringify(codes)}`);
  assert.ok(codes.includes('P2015'), `expected P2015, got ${JSON.stringify(codes)}`);
});

test('readModuleDTCs on Engine (0x01) surfaces OBD-II Mode 03/07 powertrain codes on physical header 7E0', async () => {
  const t = new FakeTransport({
    '19 02 09': '59 02 CF',
    '03': '43 01 02 99',
    '07': '47 01 04 01'
  });
  const uds = new UdsClient(t);
  const dtcs = await uds.readModuleDTCs('0x01');

  assert.ok(t.sent.includes('ATSH 7E0'));
  assert.ok(!t.sent.some(c => c.includes('7DF')));
  const codes = dtcs.map(d => d.code);
  assert.ok(codes.includes('P0299'), `expected confirmed P0299 from Mode 03, got ${JSON.stringify(codes)}`);
  assert.ok(codes.includes('P0401'), `expected pending P0401 from Mode 07, got ${JSON.stringify(codes)}`);
});

test('readModuleDTCs on VAG ODX Engine (0x01) decodes 24-bit event 15916 (00 3E 2C) as P0671 and deduplicates Mode 03', async () => {
  // EV_ECM16TDI01104L906056HE in ASCII: 45 56 5F 45 43 4D 31 36 54 44 49
  const t = new FakeTransport({
    '22 F1 9E': '62 F1 9E 45 56 5F 45 43 4D 31 36 54 44 49',
    '19 02 09': '59 02 FF 00 3E 2C 2F',
    '03': '43 01 06 71',
    '07': '47 00'
  });
  const uds = new UdsClient(t);
  const dtcs = await uds.readModuleDTCs('0x01');

  assert.equal(dtcs.length, 1, `expected single deduplicated P0671 fault, got ${JSON.stringify(dtcs.map(d => d.code))}`);
  assert.equal(dtcs[0].saeCode, 'P0671');
  assert.equal(dtcs[0].vagCode, '15916');
  assert.ok(!dtcs[0].code.startsWith('P003E'), 'must never misdecode VAG UDS 15916 (00 3E 2C) as SAE P003E-2C');
  assert.match(dtcs[0].title, /glow plug/i);
});

test('readModuleDTCs on VAG ODX DQ200 Transmission (0x02) decodes 10776/10778/10812 and strips 0xAA CAN padding', async () => {
  // EV_TCMDQ200021 in ASCII: 45 56 5F 54 43 4D 44 51 32 30 30
  const t = new FakeTransport({
    '22 F1 9E': '62 F1 9E 45 56 5F 54 43 4D 44 51 32 30 30',
    '19 02 09': '00F\r0: 59 02 FF 00 2A 18\r1: 28 00 2A 1A 28 00 2A\r2: 3C 28 AA AA AA AA AA',
    '03': '43 00',
    '07': '47 00'
  });
  const uds = new UdsClient(t);
  const dtcs = await uds.readModuleDTCs('0x02');

  assert.equal(dtcs.length, 3, `expected 3 real TCM faults without B2AAA-AA padding, got ${JSON.stringify(dtcs.map(d => d.code))}`);
  const saeCodes = dtcs.map(d => d.saeCode);
  assert.deepEqual(saeCodes, ['P177B', 'P177C', 'P1895']);
  assert.ok(!dtcs.some(d => d.code.includes('B2AAA') || d.code.startsWith('P002A')));
});

test('unlisted VAG ODX 24-bit event codes report honestly as VAG decimal events without fabricating SAE or FTB labels', async () => {
  // EV_BCMMQB in ASCII: 45 56 5F 42 43 4D 4D 51 42
  // 0x00 0x4E 0x21 = decimal 20001 (unlisted)
  const t = new FakeTransport({
    '22 F1 9E': '62 F1 9E 45 56 5F 42 43 4D 4D 51 42',
    '19 02 09': '59 02 FF 00 4E 21 28'
  });
  const uds = new UdsClient(t);
  const dtcs = await uds.readModuleDTCs('0x09');

  assert.equal(dtcs.length, 1);
  assert.equal(dtcs[0].isKnown, false);
  assert.equal(dtcs[0].code, 'VAG 20001');
  assert.equal(dtcs[0].saeCode, null);
  assert.equal(dtcs[0].symptom, null);
  assert.deepEqual(dtcs[0].causes, []);
  assert.deepEqual(dtcs[0].fixes, []);
});

