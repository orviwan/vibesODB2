// vibesODB2 Client-Side ISO-TP (ISO 15765-2) Framing and Reassembler

export class IsoTpAssembler {
  constructor(bleTransport) {
    this.transport = bleTransport;
  }

  /**
   * Parses raw lines returned by ELM327 into a clean payload buffer.
   * Handles Single Frame, First Frame, and Consecutive Frames.
   */
  async assembleResponse(rawResponse, expectedHeader = null) {
    if (!rawResponse) return new Uint8Array([]);

    const clean = rawResponse.replace(/>/g, '').trim();
    if (/^(NO DATA|ERROR|CAN ERROR|FC ERROR|FB ERROR|DATA ERROR|BUFFER FULL|STOPPED|UNABLE TO CONNECT|\?)$/i.test(clean)) {
      return new Uint8Array([]);
    }

    const lines = clean.split(/[\r\n]+/)
      .map(l => l.trim())
      .filter(l => l.length > 0 && !/NO DATA|CAN ERROR|FC ERROR|FB ERROR|DATA ERROR|BUFFER FULL|STOPPED|UNABLE|\?|SEARCHING|BUS INIT/i.test(l));

    if (lines.length === 0) return new Uint8Array([]);

    // Check for ELM327 "00F \r 0: 62 F1 90 ... 1: 5A ..." indexed multi-frame format
    const isIndexedMultiFrame = lines.some(l => /(?:^|\s)[0-9A-F]+:/i.test(l));
    if (isIndexedMultiFrame) {
      let declaredLength = null;
      const hexTokens = [];

      for (let idx = 0; idx < lines.length; idx++) {
        let line = lines[idx];
        // Check for standalone 2-3 hex-digit total byte length line preceding "0:" (e.g. "00F" or "021")
        if (!line.includes(':')) {
          const compact = line.replace(/\s+/g, '');
          if (declaredLength === null && /^[0-9A-F]{2,3}$/i.test(compact)) {
            declaredLength = parseInt(compact, 16);
            continue;
          }
        } else if (declaredLength === null) {
          // Also handle single-line "00F 0: 59 02 ..."
          const inlineLen = line.match(/^([0-9A-F]{3})\s+(?=0:)/i);
          if (inlineLen) {
            declaredLength = parseInt(inlineLen[1], 16);
            line = line.slice(inlineLen[0].length);
          }
        }

        // Split if multiple "N:" segments appear on one line
        const segments = line.split(/(?=(?:^|\s)[0-9A-F]+:)/i);
        for (const seg of segments) {
          const body = seg.trim().replace(/^[0-9A-F]+:\s*/i, '').trim();
          if (!body) continue;
          let tokens = body.split(/\s+/).filter(Boolean);
          if (tokens.length === 1 && tokens[0].length > 2 && tokens[0].length % 2 === 0 && /^[0-9A-F]+$/i.test(tokens[0])) {
            const hexStr = tokens[0];
            tokens = [];
            for (let k = 0; k < hexStr.length; k += 2) {
              tokens.push(hexStr.substring(k, k + 2));
            }
          }
          for (const t of tokens) {
            if (/^[0-9A-F]{2}$/i.test(t)) {
              hexTokens.push(t);
            }
          }
        }
      }

      const bytes = hexTokens.map(t => parseInt(t, 16));
      if (declaredLength !== null && declaredLength > 0 && bytes.length >= declaredLength) {
        return new Uint8Array(bytes.slice(0, declaredLength));
      }
      // Fallback: if byte 0 is total length and byte 1 is positive/negative response SID
      if (declaredLength === null && bytes.length > 2 && bytes[0] <= bytes.length - 1 && (bytes[1] >= 0x40 && bytes[1] <= 0x7F)) {
        return new Uint8Array(bytes.slice(1, 1 + bytes[0]));
      }
      return new Uint8Array(bytes);
    }

    // Check for ISO-TP Single / Multi frames (with or without CAN ID header)
    let totalLength = null;
    let payload = [];
    let isIsoTp = false;

    for (const line of lines) {
      let tokens = line.split(/\s+/).filter(t => /^[0-9A-F]{1,}$/i.test(t));
      if (tokens.length === 0) continue;

      // Handle unspaced contiguous hex stream: e.g. "5902CF045D..." or "5802045D08..."
      if (tokens.length === 1 && tokens[0].length > 2 && tokens[0].length % 2 === 0) {
        const hexStr = tokens[0];
        tokens = [];
        for (let k = 0; k < hexStr.length; k += 2) {
          tokens.push(hexStr.substring(k, k + 2));
        }
      }

      // Strip 3-char (11-bit) or 8-char (29-bit) CAN arbitration ID if present
      if (tokens[0].length === 3 || tokens[0].length === 8) {
        tokens = tokens.slice(1);
      }

      const byteTokens = tokens.filter(t => /^[0-9A-F]{2}$/i.test(t));
      if (byteTokens.length === 0) continue;

      const b0 = parseInt(byteTokens[0], 16);
      const frameType = (b0 & 0xF0) >> 4;

      if (frameType === 0x0 && byteTokens.length > 1) {
        // Single Frame: length in low nibble
        const len = b0 & 0x0F;
        const data = byteTokens.slice(1, 1 + len).map(b => parseInt(b, 16));
        return new Uint8Array(data);
      } else if (frameType === 0x1 && byteTokens.length >= 2) {
        // First Frame: total length in low 12 bits
        isIsoTp = true;
        const lenHigh = b0 & 0x0F;
        const lenLow = parseInt(byteTokens[1], 16);
        totalLength = (lenHigh << 8) | lenLow;
        const data = byteTokens.slice(2).map(b => parseInt(b, 16));
        payload.push(...data);
      } else if (frameType === 0x2 && isIsoTp) {
        // Consecutive Frame
        const data = byteTokens.slice(1).map(b => parseInt(b, 16));
        payload.push(...data);
        if (totalLength && payload.length >= totalLength) {
          return new Uint8Array(payload.slice(0, totalLength));
        }
      }
    }

    if (isIsoTp && payload.length > 0) {
      if (totalLength && payload.length >= totalLength) {
        return new Uint8Array(payload.slice(0, totalLength));
      }
      return new Uint8Array(payload);
    }

    // Fallback: Direct hex bytes (e.g. ATH0 clean payload: "62 F1 87 35 51 ..." or unspaced "62F187...")
    const allHex = [];
    for (const line of lines) {
      let tokens = line.split(/\s+/).filter(t => /^[0-9A-F]{1,}$/i.test(t));
      if (tokens.length === 1 && tokens[0].length > 2 && tokens[0].length % 2 === 0) {
        const hexStr = tokens[0];
        tokens = [];
        for (let k = 0; k < hexStr.length; k += 2) {
          tokens.push(hexStr.substring(k, k + 2));
        }
      }
      if (tokens.length > 0 && (tokens[0].length === 3 || tokens[0].length === 8)) {
        tokens = tokens.slice(1);
      }
      for (const t of tokens) {
        if (/^[0-9A-F]{2}$/i.test(t)) {
          allHex.push(parseInt(t, 16));
        }
      }
    }

    return new Uint8Array(allHex);
  }

  /**
   * Packetizes an arbitrary length buffer into ISO-TP CAN frames.
   */
  static packetize(dataBytes) {
    const frames = [];
    const len = dataBytes.length;

    if (len <= 7) {
      // Single Frame (0x00 + length)
      const frame = [0x00 | len, ...dataBytes];
      while (frame.length < 8) frame.push(0x55); // ISO CAN padding
      frames.push(frame);
    } else {
      // First Frame: 0x10 | (len >> 8), len & 0xFF
      const ff = [0x10 | ((len >> 8) & 0x0F), len & 0xFF, ...dataBytes.slice(0, 6)];
      frames.push(ff);

      let offset = 6;
      let seq = 1;
      while (offset < len) {
        const chunk = dataBytes.slice(offset, offset + 7);
        const cf = [0x20 | (seq & 0x0F), ...chunk];
        while (cf.length < 8) cf.push(0x55);
        frames.push(cf);
        offset += 7;
        seq = (seq + 1) % 16;
      }
    }

    return frames.map(f => f.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' '));
  }
}
