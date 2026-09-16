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

  static getSupportInfo() {
    const supported = WebBleTransport.isSupported();
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isChrome = /Chrome|Chromium|CriOS/i.test(ua) && !/Edg/i.test(ua);
    const isFirefox = /Firefox|FxiOS/i.test(ua);

    return {
      supported,
      isLinux,
      isAndroid,
      isIOS,
      isChrome,
      isFirefox,
      ua
    };
  }

  static getUnsupportedMessage() {
    const info = WebBleTransport.getSupportInfo();
    if (info.isLinux) {
      if (info.isFirefox) {
        return 'Firefox on Linux does not support Web Bluetooth. Please open this app in Google Chrome with experimental features enabled:\n\ngoogle-chrome --enable-experimental-web-platform-features https://orviwan.github.io/vibesODB2/';
      }
      return 'Web Bluetooth is disabled by default in Chrome on Linux.\n\nTo enable it:\n1. Open chrome://flags/#enable-experimental-web-platform-features\n2. Set "Experimental Web Platform features" to Enabled and relaunch Chrome.\n\nOr launch via terminal:\ngoogle-chrome --enable-experimental-web-platform-features https://orviwan.github.io/vibesODB2/';
    }
    if (info.isIOS) {
      return 'iOS Safari does not support Web Bluetooth. Please open this link in the free "Bluefy - Web BLE Browser" app from the App Store.';
    }
    return 'Web Bluetooth is not supported in this browser. On Android or Desktop, please use Google Chrome or Edge.';
  }

  static getLastDevice() {
    try {
      const id = localStorage.getItem('vibesodb2_last_ble_id');
      const name = localStorage.getItem('vibesodb2_last_ble_name');
      if (id && name) return { id, name };
    } catch (e) {}
    return null;
  }

  static canAutoReconnect() {
    return typeof navigator !== 'undefined' &&
           !!navigator.bluetooth &&
           typeof navigator.bluetooth.getDevices === 'function' &&
           !!WebBleTransport.getLastDevice();
  }

  async connect() {
    return await this.requestAndConnect();
  }

  async reconnectLastDevice() {
    if (!WebBleTransport.canAutoReconnect()) return null;
    const last = WebBleTransport.getLastDevice();
    if (!last || !last.id) return null;

    try {
      const devices = await navigator.bluetooth.getDevices();
      const matched = devices.find(d => d.id === last.id);
      if (matched) {
        return await this.connectDevice(matched);
      }
    } catch (err) {
      console.warn('Silent BLE auto-reconnect failed:', err);
    }
    return null;
  }

  async requestAndConnect() {
    if (!WebBleTransport.isSupported()) {
      throw new Error(WebBleTransport.getUnsupportedMessage());
    }

    const optionalServices = [
      BLE_SERVICES.NORDIC_UART,
      BLE_SERVICES.CUSTOM_OBD_FFF0,
      BLE_SERVICES.CUSTOM_OBD_18F0,
      '0000fff0-0000-1000-8000-00805f9b34fb',
      '000018f0-0000-1000-8000-00805f9b34fb',
      'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
    ];

    let device = null;
    try {
      // First try acceptAllDevices so user can select any paired or nearby adapter
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices
      });
    } catch (err) {
      // Fallback to name prefix filtering if browser requires filters
      if (err.name === 'NotFoundError') {
        throw err; // User cancelled
      }
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'vLinker' },
          { namePrefix: 'OBD' },
          { namePrefix: 'IOS-Vlink' },
          { namePrefix: 'Viecar' },
          { namePrefix: 'Carista' },
          { namePrefix: 'STN' },
          { namePrefix: 'Veepeak' },
          { namePrefix: 'iCar' },
          { namePrefix: 'Konnwei' },
          { namePrefix: 'V-LINK' }
        ],
        optionalServices
      });
    }

    return await this.connectDevice(device);
  }

  async connectDevice(device) {
    if (!device) throw new Error('No Bluetooth device specified.');
    this.device = device;

    this.device.addEventListener('gattserverdisconnected', () => {
      this.isConnected = false;
      if (this.onDisconnectCallback) this.onDisconnectCallback();
    });

    this.server = await this.device.gatt.connect();

    // Locate UART Service and Characteristics
    let connectedService = null;
    this.txChar = null;
    this.rxChar = null;

    // 1. Try Nordic UART Service
    try {
      connectedService = await this.server.getPrimaryService(BLE_SERVICES.NORDIC_UART);
      this.txChar = await connectedService.getCharacteristic(BLE_SERVICES.NORDIC_TX);
      this.rxChar = await connectedService.getCharacteristic(BLE_SERVICES.NORDIC_RX);
    } catch (e) {
      // 2. Try FFF0 custom service
      try {
        connectedService = await this.server.getPrimaryService(BLE_SERVICES.CUSTOM_OBD_FFF0);
        this.txChar = await connectedService.getCharacteristic(BLE_SERVICES.CUSTOM_OBD_FFF2);
        this.rxChar = await connectedService.getCharacteristic(BLE_SERVICES.CUSTOM_OBD_FFF1);
      } catch (err2) {
        // 3. Dynamic service scan for any write/notify pair
        try {
          const services = await this.server.getPrimaryServices();
          for (const s of services) {
            try {
              const chars = await s.getCharacteristics();
              const wChar = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
              const rChar = chars.find(c => c.properties.notify || c.properties.indicate);
              if (wChar && rChar) {
                this.txChar = wChar;
                this.rxChar = rChar;
                connectedService = s;
                break;
              }
            } catch (errChars) {}
          }
        } catch (err3) {}
      }
    }

    if (!this.txChar || !this.rxChar) {
      throw new Error('Failed to locate compatible OBD-II serial GATT service on the selected Bluetooth device.');
    }

    // Subscribe to RX notifications
    await this.rxChar.startNotifications();
    this.rxChar.addEventListener('characteristicvaluechanged', (event) => {
      this._handleNotification(event);
    });

    this.isConnected = true;

    // Initialize ELM327 / STN protocol
    await this.initAdapter();

    // Persist successful device in localStorage for 1-click / auto-reconnect
    try {
      if (this.device.id && this.device.name) {
        localStorage.setItem('vibesodb2_last_ble_id', this.device.id);
        localStorage.setItem('vibesodb2_last_ble_name', this.device.name);
      }
    } catch (e) {}

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
    await this.sendCommand('ATH0');        // Headers off (returns clean payload bytes)
    await this.sendCommand('ATSP6');       // ISO 15765-4 CAN (11 bit ID, 500 kbaud)
    try {
      await this.sendCommand('ATCAF1');    // STN / ELM327 Automatic CAN Formatting & Flow Control
    } catch (e) {
      // Ignore if adapter is basic clone
    }
  }

  async setHeader(headerHex) {
    await this.sendCommand(`ATSH ${headerHex}`);
  }

  async setFilter(filterHex) {
    if (filterHex && filterHex.trim()) {
      await this.sendCommand(`ATCRA ${filterHex.trim()}`);
    } else {
      await this.sendCommand('ATCRA'); // Clear filter to accept responses
    }
  }

  async setFlowControl(txHex, rxHex) {
    try {
      if (txHex && txHex !== '7DF') {
        await this.sendCommand(`ATFCSH ${txHex}`);
        await this.sendCommand('ATFCSD 300000');
        await this.sendCommand('ATFCSM 1');
      } else {
        await this.sendCommand('ATFCSM 0');
      }
    } catch (e) {
      // Ignore if adapter is basic clone
    }
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      await this.device.gatt.disconnect();
    }
    this.isConnected = false;
  }
}
