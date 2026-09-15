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
    const lines = rawResponse.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
    let totalLength = null;
    let payload = [];
    let nextSeq = 1;

    for (const line of lines) {
      // Remove any CAN error or echo messages
      if (line.includes('NO DATA') || line.includes('ERROR') || line.includes('CAN ERROR') || line.startsWith('SEARCHING')) {
        continue;
      }

      // Split hex bytes
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      let pciIdx = 0;
      // If header is enabled (ATH1), parts[0] is typically the 3-char CAN ID (e.g. 7E8)
      if (parts[0].length === 3 || parts[0].length === 8) {
        pciIdx = 1;
      }

      if (pciIdx >= parts.length) continue;

      const pci = parseInt(parts[pciIdx], 16);
      const frameType = (pci & 0xF0) >> 4;

      if (frameType === 0x0) {
        // Single Frame: length in low nibble
        const length = pci & 0x0F;
        const frameData = parts.slice(pciIdx + 1, pciIdx + 1 + length).map(b => parseInt(b, 16));
        return new Uint8Array(frameData);
      } else if (frameType === 0x1) {
        // First Frame: total length in lower 12 bits
        const highNibble = pci & 0x0F;
        const lowByte = parseInt(parts[pciIdx + 1], 16);
        totalLength = (highNibble << 8) | lowByte;

        // Data starts at pciIdx + 2
        const frameData = parts.slice(pciIdx + 2).map(b => parseInt(b, 16));
        payload.push(...frameData);

        // Send Flow Control frame if hardware flow control (ATCAF1) is not auto-handling it
        try {
          await this.transport.sendCommand('30 00 00', 1000);
        } catch (e) {
          // Hardware might already have handled it
        }
      } else if (frameType === 0x2) {
        // Consecutive Frame: sequence number in lower 4 bits
        const seq = pci & 0x0F;
        const frameData = parts.slice(pciIdx + 1).map(b => parseInt(b, 16));
        payload.push(...frameData);

        if (totalLength && payload.length >= totalLength) {
          return new Uint8Array(payload.slice(0, totalLength));
        }
      }
    }

    if (totalLength && payload.length >= totalLength) {
      return new Uint8Array(payload.slice(0, totalLength));
    }

    // Fallback: parse whatever hex data was received
    const flatBytes = [];
    for (const line of lines) {
      const parts = line.split(/\s+/).filter(p => /^[0-9A-Fa-f]{2}$/.test(p));
      for (const p of parts) {
        flatBytes.push(parseInt(p, 16));
      }
    }
    return new Uint8Array(flatBytes);
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
