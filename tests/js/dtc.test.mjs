import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeSaeJ2012,
  encodeSaeDtcBytes,
  decodeUdsDtcBytes,
  lookupDtc,
  ensureDtcDatabaseLoaded,
  getDtcDatabaseStats,
  registerCustomDtcs,
  clearCustomDtcs
} from '../../pwa/js/dtc_db.js';
import { SimulatedBleTransport } from '../../pwa/js/simulator.js';
import { UdsClient } from '../../pwa/js/uds.js';

test('SAE J2012 round-trip encodes and decodes P, C, B and U codes with FTB', () => {
  const cases = [
    { str: 'P0101', ftb: 0x00, bytes: [0x01, 0x01, 0x00], base: 'P0101' },
    { str: 'P0299', ftb: 0x00, bytes: [0x02, 0x99, 0x00], base: 'P0299' },
    { str: 'P2015', ftb: 0x00, bytes: [0x20, 0x15, 0x00], base: 'P2015' },
    { str: 'B104A15', ftb: 0x15, bytes: [0x90, 0x4A, 0x15], base: 'B104A' },
    { str: 'C10AC07', ftb: 0x07, bytes: [0x50, 0xAC, 0x07], base: 'C10AC' },
    { str: 'U010087', ftb: 0x87, bytes: [0xC1, 0x00, 0x87], base: 'U0100' },
    { str: 'U111300', ftb: 0x00, bytes: [0xD1, 0x13, 0x00], base: 'U1113' }
  ];

  for (const c of cases) {
    const encoded = encodeSaeDtcBytes(c.str, c.ftb);
    assert.deepEqual(Array.from(encoded), c.bytes, `encode failed for ${c.str}`);
    assert.equal(decodeSaeJ2012(c.bytes[0], c.bytes[1]), c.base, `decode failed for ${c.str}`);
  }
});

test('expanded bundled DTC JSON dictionary loads at least 200 original entries', async () => {
  await ensureDtcDatabaseLoaded();
  const stats = getDtcDatabaseStats();
  assert.ok(stats.totalCodes >= 200, `expected >= 200 codes, got ${stats.totalCodes}`);

  for (const code of ['P0101', 'P0234', 'P0299', 'P0401', 'P2002', 'P2015', 'P2463', 'U0100', 'U0121', 'U0140', 'B104A', '00532', '01117']) {
    const entry = lookupDtc(code);
    assert.equal(entry.isKnown, true, `expected ${code} to be known in bundled DTC DB`);
    assert.ok(entry.title && !entry.title.startsWith('Standard Diagnostic Trouble Code'), `expected specific title for ${code}`);
    assert.ok(entry.meaning && entry.meaning.length > 20, `expected meaningful explanation for ${code}`);
  }
});

test('unlisted codes decode FTB and subsystem honestly without fabricated causes or fixes', async () => {
  await ensureDtcDatabaseLoaded();
  // 0xAF 0x99 0x11 -> B2F99 with FTB 0x11 (Circuit short to ground)
  const res = decodeUdsDtcBytes(0xAF, 0x99, 0x11, 0x2F, '0x09');
  assert.equal(res.isKnown, false);
  assert.equal(res.code, 'B2F99-11');
  assert.equal(res.baseCode, 'B2F99');
  assert.match(res.symptom || '', /short to ground/i);
  assert.deepEqual(res.causes, [], 'unlisted codes must not invent generic causes');
  assert.deepEqual(res.fixes, [], 'unlisted codes must not invent generic fixes');
});

test('KWP2000 intermittent symptom bit 0x80 is stripped when decoding symptom label', async () => {
  await ensureDtcDatabaseLoaded();
  // 0x88 = intermittent (0x80) + 008 (Implausible Signal)
  const parsed = lookupDtc(1117, null, 0x88, { protocol: 'KWP2000' });
  assert.equal(parsed.code, '01117');
  assert.match(parsed.symptom || '', /implausible signal/i);
  assert.equal(parsed.isIntermittent, true);
});

test('KWP2000 VAG 16384-offset powertrain codes cross-reference SAE P-codes', async () => {
  await ensureDtcDatabaseLoaded();
  // 16683 = 16384 + 299 -> P0299; 16502 = 16384 + 118 -> P0118; 18010 -> P1602
  const p0299 = lookupDtc(16683, null, 0x02, { protocol: 'KWP2000', moduleAddress: '0x01' });
  assert.equal(p0299.isKnown, true);
  assert.equal(p0299.saeCode, 'P0299');
  assert.match(p0299.title, /underboost|boost/i);

  const p1602 = lookupDtc(18010, null, 0x02, { protocol: 'KWP2000', moduleAddress: '0x01' });
  assert.equal(p1602.saeCode, 'P1602');
});

test('Transporter T5.1 simulator BCM UDS scan decodes B104A-15 and 00532 accurately', async () => {
  await ensureDtcDatabaseLoaded();
  const sim = new SimulatedBleTransport('transporter_t51');
  await sim.connect();
  const uds = new UdsClient(sim);
  const dtcs = await uds.readModuleDTCs('0x09');

  const codes = dtcs.map(d => d.code);
  assert.ok(codes.includes('B104A-15'), `expected B104A-15 in ${JSON.stringify(codes)}`);
  assert.ok(codes.includes('00532'), `expected 00532 in ${JSON.stringify(codes)}`);

  const rainFault = dtcs.find(d => d.code === 'B104A-15');
  assert.equal(rainFault.isKnown, true);
  assert.match(rainFault.title, /rain|light/i);
  assert.match(rainFault.symptom || '', /short to (battery|plus)|open/i);
});

test('custom user DTC entries override unlisted codes and can be cleared', () => {
  clearCustomDtcs();
  registerCustomDtcs({
    'P1999': {
      title: 'Custom Test Cooling Valve Circuit',
      meaning: 'User-supplied reference entry for test verification.'
    }
  });
  const hit = lookupDtc('P1999');
  assert.equal(hit.isKnown, true);
  assert.equal(hit.source, 'custom');
  assert.equal(hit.title, 'Custom Test Cooling Valve Circuit');

  clearCustomDtcs();
  const after = lookupDtc('P1999');
  assert.equal(after.isKnown, false);
});
