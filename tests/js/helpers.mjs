// Shared test doubles for vibesODB2 PWA unit tests (node:test, no browser).

// storage.js touches window/localStorage lazily; provide minimal stubs.
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {};
}
{
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  } });
}

/**
 * Scripted fake ELM327 transport.
 * `script` maps a command string (as sent) to a response string or a function.
 * Unknown commands answer 'OK' for AT commands and 'NO DATA' otherwise.
 */
export class FakeTransport {
  constructor(script = {}) {
    this.script = script;
    this.sent = [];
    this.isConnected = true;
  }
  async sendCommand(cmd) {
    this.sent.push(cmd);
    const key = cmd.replace(/\s+/g, ' ').trim().toUpperCase();
    let res = this.script[key];
    if (typeof res === 'function') res = res(cmd);
    if (res === undefined) res = key.startsWith('AT') ? 'OK' : 'NO DATA';
    if (res instanceof Error) throw res;
    return res;
  }
  async setHeader(h) { await this.sendCommand(`ATSH ${h}`); }
  async setFilter(f) { await this.sendCommand(f ? `ATCRA ${f}` : 'ATCRA'); }
  async setFlowControl() { /* no-op */ }
}
