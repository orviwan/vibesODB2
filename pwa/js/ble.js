// vibesODB2 Web Bluetooth Hardware Abstraction Layer

export const BLE_SERVICES = {
  // Nordic UART Service (vLinker MC+, OBDLink CX, Viecar, Carista BLE)
  NORDIC_UART: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  NORDIC_TX: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Write / WriteWithoutResponse
  NORDIC_RX: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Notify

  // Alternate BLE OBD-II Services
  CUSTOM_OBD_FFF0: '0000fff0-0000-1000-8000-00805f9b34fb',
  CUSTOM_OBD_FFF1: '0000fff1-0000-1000-8000-00805f9b34fb',
  CUSTOM_OBD_FFF2: '0000fff2-0000-1000-8000-00805f9b34fb',

  CUSTOM_OBD_18F0: '000018f0-0000-1000-8000-00805f9b34fb'
};

export class WebBleTransport {
  constructor() {
    this.device = null;
    this.server = null;
    this.txChar = null;
    this.rxChar = null;
    this.isConnected = false;
    this.rxBuffer = '';
    this.pendingQueue = [];
    this.currentTx = null;
    this.onDisconnectCallback = null;
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  async requestAndConnect() {
    if (!WebBleTransport.isSupported()) {
      throw new Error(
        'Web Bluetooth is not supported in this browser. On Android or Desktop, use Google Chrome or Edge. On iPhone/iPad, please open this link in the free "Bluefy - Web BLE Browser" app.'
      );
    }

    // Filter devices by common prefixes and service UUIDs
    this.device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'vLinker' },
        { namePrefix: 'OBD' },
        { namePrefix: 'IOS-Vlink' },
        { namePrefix: 'Viecar' },
        { namePrefix: 'Carista' },
        { namePrefix: 'STN' }
      ],
      optionalServices: [
        BLE_SERVICES.NORDIC_UART,
        BLE_SERVICES.CUSTOM_OBD_FFF0,
        BLE_SERVICES.CUSTOM_OBD_18F0
      ]
    });

    this.device.addEventListener('gattserverdisconnected', () => {
      this.isConnected = false;
      if (this.onDisconnectCallback) this.onDisconnectCallback();
    });

    this.server = await this.device.gatt.connect();

    // Locate UART Service
    let service = null;
    try {
      service = await this.server.getPrimaryService(BLE_SERVICES.NORDIC_UART);
      this.txChar = await service.getCharacteristic(BLE_SERVICES.NORDIC_TX);
      this.rxChar = await service.getCharacteristic(BLE_SERVICES.NORDIC_RX);
    } catch (e) {
      // Try alternate FFF0 service
      try {
        service = await this.server.getPrimaryService(BLE_SERVICES.CUSTOM_OBD_FFF0);
        this.txChar = await service.getCharacteristic(BLE_SERVICES.CUSTOM_OBD_FFF2);
        this.rxChar = await service.getCharacteristic(BLE_SERVICES.CUSTOM_OBD_FFF1);
      } catch (err2) {
        throw new Error('Failed to find compatible serial GATT service on the selected Bluetooth device.');
      }
    }

    // Subscribe to RX notifications
    await this.rxChar.startNotifications();
    this.rxChar.addEventListener('characteristicvaluechanged', (event) => {
      this._handleNotification(event);
    });

    this.isConnected = true;

    // Initialize ELM327 / STN protocol
    await this.initAdapter();

    return {
      name: this.device.name,
      id: this.device.id
    };
  }

  _handleNotification(event) {
    const value = event.target.value;
    const decoder = new TextDecoder('utf-8');
    const chunk = decoder.decode(value);
    this.rxBuffer += chunk;

    // ELM prompt character is '>'
    if (this.rxBuffer.includes('>')) {
      const parts = this.rxBuffer.split('>');
      const completedResponse = parts[0].trim();
      this.rxBuffer = parts.slice(1).join('>');

      if (this.currentTx) {
        clearTimeout(this.currentTx.timer);
        this.currentTx.resolve(completedResponse);
        this.currentTx = null;
        this._processQueue();
      }
    }
  }

  async sendCommand(cmd, timeoutMs = 3000) {
    if (!this.isConnected) {
      throw new Error('Not connected to Bluetooth adapter.');
    }

    return new Promise((resolve, reject) => {
      this.pendingQueue.push({ cmd, timeoutMs, resolve, reject });
      if (!this.currentTx) {
        this._processQueue();
      }
    });
  }

  async _processQueue() {
    if (this.pendingQueue.length === 0 || this.currentTx) return;

    const tx = this.pendingQueue.shift();
    this.currentTx = tx;

    const formattedCmd = tx.cmd.trim() + '\r';
    const encoder = new TextEncoder();
    const data = encoder.encode(formattedCmd);

    tx.timer = setTimeout(() => {
      if (this.currentTx === tx) {
        this.currentTx = null;
        tx.reject(new Error(`Command '${tx.cmd}' timed out after ${tx.timeoutMs}ms`));
        this._processQueue();
      }
    }, tx.timeoutMs);

    try {
      // Chunk writes to match BLE MTU (typically 20 bytes for standard BLE)
      const chunkSize = 20;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        if (this.txChar.properties.writeWithoutResponse) {
          await this.txChar.writeValueWithoutResponse(chunk);
        } else {
          await this.txChar.writeValueWithResponse(chunk);
        }
      }
    } catch (err) {
      clearTimeout(tx.timer);
      this.currentTx = null;
      tx.reject(err);
      this._processQueue();
    }
  }

  async initAdapter() {
    // ELM/STN handshake
    await this.sendCommand('ATZ', 4000);   // Reset
    await this.sendCommand('ATE0');        // Echo off
    await this.sendCommand('ATL0');        // Linefeed off
    await this.sendCommand('ATH1');        // Headers on (required for CAN ID arbitration)
    await this.sendCommand('ATSP6');       // ISO 15765-4 CAN (11 bit ID, 500 kbaud)
    try {
      await this.sendCommand('ATCAF1');    // Try STN hardware flow control acceleration
    } catch (e) {
      // Ignore if adapter is basic clone
    }
  }

  async setHeader(headerHex) {
    await this.sendCommand(`ATSH ${headerHex}`);
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
    }
    this.isConnected = false;
  }
}
