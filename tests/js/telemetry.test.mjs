import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeTransport } from './helpers.mjs';
import { TelemetryEngine } from '../../pwa/js/telemetry.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('a paused telemetry engine stops issuing commands until resumed', async () => {
  const t = new FakeTransport({ '010C': '41 0C 00 00', '010D': '41 0D 00' });
  const eng = new TelemetryEngine({ bleTransport: t, onUpdate: () => {}, onRateUpdate: () => {} });
  eng.start();
  await sleep(120);
  await eng.pause();
  const atPause = t.sent.length;
  await sleep(120);
  assert.equal(t.sent.length, atPause, 'no commands while paused');
  eng.resume();
  await sleep(120);
  assert.ok(t.sent.length > atPause, 'commands resume');
  eng.stop();
});

test('telemetry re-applies the broadcast header and engine filter after resuming', async () => {
  const t = new FakeTransport({ '010C': '41 0C 00 00', '010D': '41 0D 00' });
  const eng = new TelemetryEngine({ bleTransport: t, onUpdate: () => {}, onRateUpdate: () => {} });
  eng.start();
  await sleep(80);
  await eng.pause();
  await t.sendCommand('ATSH 70E');           // a diagnostic operation re-targets a module
  const mark = t.sent.length;
  eng.resume();
  await sleep(120);
  const after = t.sent.slice(mark);
  const iHdr = after.indexOf('ATSH 7DF');
  const iPid = after.findIndex(c => c === '010C');
  assert.ok(iHdr !== -1 && iHdr < iPid, `expected ATSH 7DF before the next PID, got ${after.join(' | ')}`);
  eng.stop();
});

test('pause() waits for the start-up header setup so no telemetry command lands after it resolves', async () => {
  const t = new FakeTransport({ '010C': '41 0C 00 00', '010D': '41 0D 00' });
  const slow = t.sendCommand.bind(t);
  t.sendCommand = async (c) => { await sleep(30); return slow(c); };
  const eng = new TelemetryEngine({ bleTransport: t, onUpdate: () => {}, onRateUpdate: () => {} });
  eng.start();                 // begins with ATSH 7DF / ATCRA 7E8 (each 30 ms)
  await eng.pause();
  const atPause = t.sent.length;
  await sleep(150);
  assert.equal(t.sent.length, atPause, `commands sent after pause resolved: ${t.sent.slice(atPause).join(' | ')}`);
  assert.ok(t.sent.includes('ATSH 7DF'), 'header setup must have completed before pause resolved');
  eng.stop();
});

test('start({ paused: true }) sends nothing, not even the header setup, until resumed', async () => {
  const t = new FakeTransport({ '010C': '41 0C 00 00', '010D': '41 0D 00' });
  const eng = new TelemetryEngine({ bleTransport: t, onUpdate: () => {}, onRateUpdate: () => {} });
  eng.start({ paused: true });
  await sleep(120);
  assert.deepEqual(t.sent, [], `commands sent while started paused: ${t.sent.join(' | ')}`);
  eng.resume();
  await sleep(120);
  assert.equal(t.sent[0], 'ATSH 7DF');
  assert.ok(t.sent.includes('010C'));
  eng.stop();
});

test('parsePidResponse reads unspaced replies (adapters with ATS0 or the simulator)', () => {
  const eng = new TelemetryEngine({ bleTransport: new FakeTransport(), onUpdate: () => {}, onRateUpdate: () => {} });
  eng.parsePidResponse('410C0C80');
  assert.equal(eng.latestMetrics.engine_rpm, 800);
  eng.parsePidResponse('410D34');
  assert.equal(eng.latestMetrics.vehicle_speed_kmh, 52);
  eng.parsePidResponse('41 0C 1F 40');
  assert.equal(eng.latestMetrics.engine_rpm, 2000);
});
