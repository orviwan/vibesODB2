import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeTransport } from './helpers.mjs';
import { SafetyPipeline } from '../../pwa/js/safety.js';

const BASE = { vin: 'WV1ZZZ7EZEH000001', did: '0600', baselineHex: 'AA BB', modifiedHex: 'AA BC', baselineCaptured: true };

test('audit reports failures in an errors array as well as error', async () => {
  const p = new SafetyPipeline(new FakeTransport(), null);
  const r = await p.preWriteAudit({ ...BASE, targetModule: '0x03' });
  assert.equal(r.passed, false);
  assert.ok(Array.isArray(r.errors) && r.errors.length === 1);
  assert.equal(r.errors[0], r.error);
});

test('blacklist matches module addresses written without the 0x prefix or in upper case', async () => {
  const p = new SafetyPipeline(new FakeTransport(), null);
  for (const m of ['03', '0X15', '44']) {
    const r = await p.preWriteAudit({ ...BASE, targetModule: m });
    assert.equal(r.passed, false, `${m} should be blacklisted`);
    assert.match(r.error, /blacklisted/i);
  }
});

test('a truncated RPM reply does not pass the engine interlock', async () => {
  const t = new FakeTransport({ '01 0C': '41 0C' });
  const p = new SafetyPipeline(t, null);
  const r = await p.preWriteAudit({ ...BASE, targetModule: '0x09' });
  assert.equal(r.passed, false);
  assert.match(r.error, /interlock/i);
});

test('the RX filter is cleared before the broadcast RPM query', async () => {
  const t = new FakeTransport({ '01 0C': '41 0C 00 00' });
  const p = new SafetyPipeline(t, null);
  await p.preWriteAudit({ ...BASE, targetModule: '0x09' });
  const iFilter = t.sent.indexOf('ATCRA');
  const iRpm = t.sent.indexOf('01 0C');
  assert.ok(iFilter !== -1 && iFilter < iRpm, `expected ATCRA before 01 0C, got ${t.sent.join(' | ')}`);
});

test('audit fails when no live baseline has been captured from the vehicle', async () => {
  const t = new FakeTransport({ '01 0C': '41 0C 00 00' });
  const p = new SafetyPipeline(t, null);
  const r = await p.preWriteAudit({ ...BASE, targetModule: '0x09', baselineCaptured: false });
  assert.equal(r.passed, false);
  assert.match(r.error, /baseline/i);
});

test('audit passes with engine off, matching lengths and a captured baseline', async () => {
  const t = new FakeTransport({ '01 0C': '41 0C 00 00' });
  const p = new SafetyPipeline(t, null);
  const r = await p.preWriteAudit({ ...BASE, targetModule: '0x09' });
  assert.equal(r.passed, true, JSON.stringify(r));
  assert.deepEqual(r.errors, []);
});
