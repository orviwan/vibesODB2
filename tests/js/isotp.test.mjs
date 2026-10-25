import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IsoTpAssembler } from '../../pwa/js/isotp.js';

test('IsoTpAssembler trims ELM327 indexed multi-frame responses using 3-digit hex length line so 0xAA padding is stripped', async () => {
  const assembler = new IsoTpAssembler(null);
  // Real-world MQB TCM (0CW DQ200) multi-frame UDS 0x19 02 response: 15 bytes (0x00F) + 5 bytes of 0xAA CAN frame padding
  const raw = [
    '00F',
    '0: 59 02 FF 00 2A 18',
    '1: 28 00 2A 1A 28 00 2A',
    '2: 3C 28 AA AA AA AA AA'
  ].join('\r');

  const bytes = await assembler.assembleResponse(raw);
  assert.equal(bytes.length, 15, `expected exact 15-byte UDS payload without 0xAA padding, got ${bytes.length}`);
  assert.deepEqual(
    Array.from(bytes),
    [0x59, 0x02, 0xFF, 0x00, 0x2A, 0x18, 0x28, 0x00, 0x2A, 0x1A, 0x28, 0x00, 0x2A, 0x3C, 0x28]
  );
});

test('IsoTpAssembler trims 33-byte (0x021) long-coding multi-frame response and handles ATS0 unspaced indexed lines', async () => {
  const assembler = new IsoTpAssembler(null);
  // 3 bytes UDS header (62 06 00) + 30 bytes coding = 33 bytes (0x021), padded with 0xAA on final frame
  const raw = [
    '021',
    '0:620600010203',
    '1:0405060708090A',
    '2:0B0C0D0E0F1011',
    '3:12131415161718',
    '4:191A1B1C1D1EAA'
  ].join('\r');

  const bytes = await assembler.assembleResponse(raw);
  assert.equal(bytes.length, 33, `expected exact 33 bytes (3 header + 30 coding), got ${bytes.length}`);
  assert.equal(bytes[0], 0x62);
  assert.equal(bytes[32], 0x1E);
});
