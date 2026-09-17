import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { WebBleTransport } from '../../pwa/js/ble.js';

function makeTransport() {
  const t = new WebBleTransport();
  t.isConnected = true;
  t.txChar = { properties: { writeWithoutResponse: true }, writeValueWithoutResponse: async () => {} };
  return t;
}
function notify(t, text) {
  t._handleNotification({ target: { value: new TextEncoder().encode(text) } });
}

test('a response arriving after a timeout is discarded instead of answering the next command', async () => {
  const t = makeTransport();
  await assert.rejects(t.sendCommand('01 0C', 20), /timed out/);
  const next = t.sendCommand('22 06 00', 500);
  notify(t, '41 0C 12 34\r>');           // late reply to the timed-out command
  notify(t, '62 06 00 AA\r>');           // the real reply
  assert.equal(await next, '62 06 00 AA');
});

test('the discard flag does not eat a response when the next command also times out', async () => {
  const t = makeTransport();
  await assert.rejects(t.sendCommand('01 0C', 20), /timed out/);
  await assert.rejects(t.sendCommand('01 0D', 20), /timed out/);
  const next = t.sendCommand('ATRV', 500);
  notify(t, '12.4V\r>');
  assert.equal(await next, '12.4V');
});
