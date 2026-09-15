// vibesODB2 Progressive Web Application Controller
import { BUNDLED_SCHEMAS, computeByteDiff, hexStringToBytes, bytesToHexString } from './schemas.js';
import { saveBackup, getBackups, getBackupById, exportBackupsJson, importBackupsJson } from './storage.js';
import { WebBleTransport } from './ble.js';
import { UdsClient } from './uds.js';
import { SafetyPipeline, BLACKLISTED_MODULES } from './safety.js';
import { TelemetryEngine } from './telemetry.js';

export function bytesToAscii(bytes) {
  if (!bytes || bytes.length === 0) return '';
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) {
      str += String.fromCharCode(b);
    }
  }
  return str.trim();
}

export function decodeVin(vin) {
  if (!vin || vin.length < 17) return null;
  const clean = vin.toUpperCase().trim();

  // WMI (Positions 1-3)
  const wmi = clean.substring(0, 3);
  let make = 'Volkswagen';
  if (wmi.startsWith('WV1') || wmi.startsWith('WV2') || wmi.startsWith('WV3')) {
    make = 'Volkswagen Commercial';
  } else if (wmi.startsWith('WAU') || wmi.startsWith('WA1')) {
    make = 'Audi';
  } else if (wmi.startsWith('VSS')) {
    make = 'SEAT';
  } else if (wmi.startsWith('TMB')) {
    make = 'Škoda';
  } else if (wmi.startsWith('WP0') || wmi.startsWith('WP1')) {
    make = 'Porsche';
  }

  // Model / Chassis (Positions 7-8)
  const chassisCode = clean.substring(6, 8);
  let model = `${make} Vehicle`;
  let platform = 'VAG';

  const MODEL_MAP = {
    'AU': { model: 'Golf Mk7 / 7.5', platform: 'MQB' },
    '5G': { model: 'Golf Mk7 / 7.5', platform: 'MQB' },
    'BA': { model: 'Golf Variant Mk7', platform: 'MQB' },
    'BQ': { model: 'Golf Mk7.5', platform: 'MQB' },
    '1K': { model: 'Golf Mk5 / Mk6', platform: 'PQ35' },
    '5K': { model: 'Golf Mk6', platform: 'PQ35' },
    'AJ': { model: 'Golf Variant Mk6', platform: 'PQ35' },
    '7E': { model: 'Transporter T5.1 / T6', platform: 'PQ25' },
    '7F': { model: 'Transporter T5.1 / T6', platform: 'PQ25' },
    '7H': { model: 'Transporter T5', platform: 'PQ25' },
    '7J': { model: 'Transporter T5 / T6', platform: 'PQ25' },
    '7L': { model: 'Transporter T6.1', platform: 'MQB' },
    '6R': { model: 'Polo Mk5', platform: 'PQ25' },
    '6C': { model: 'Polo Mk5 Facelift', platform: 'PQ25' },
    'AW': { model: 'Polo Mk6', platform: 'MQB-A0' },
    '3C': { model: 'Passat B6 / B7', platform: 'PQ46' },
    '3G': { model: 'Passat B8', platform: 'MQB' },
    '8V': { model: 'Audi A3 / S3 Mk3', platform: 'MQB' },
    '8P': { model: 'Audi A3 Mk2', platform: 'PQ35' },
    '5F': { model: 'SEAT Leon Mk3', platform: 'MQB' },
    '1P': { model: 'SEAT Leon Mk2', platform: 'PQ35' },
    '6J': { model: 'SEAT Ibiza Mk4', platform: 'PQ25' },
    '6F': { model: 'SEAT Ibiza Mk5', platform: 'MQB-A0' },
    '5E': { model: 'Škoda Octavia Mk3', platform: 'MQB' },
    '1Z': { model: 'Škoda Octavia Mk2', platform: 'PQ35' },
    'NH': { model: 'Škoda Rapid', platform: 'PQ25' },
    'AD': { model: 'Tiguan Mk2', platform: 'MQB' },
    '5N': { model: 'Tiguan Mk1', platform: 'PQ35' },
  };

  if (MODEL_MAP[chassisCode]) {
    model = `${make} ${MODEL_MAP[chassisCode].model}`;
    platform = MODEL_MAP[chassisCode].platform;
  }

  // Model Year (Position 10)
  const yearChar = clean.charAt(9);
  const YEAR_MAP = {
    '9': 2009, 'A': 2010, 'B': 2011, 'C': 2012, 'D': 2013, 'E': 2014,
    'F': 2015, 'G': 2016, 'H': 2017, 'J': 2018, 'K': 2019, 'L': 2020,
    'M': 2021, 'N': 2022, 'P': 2023, 'R': 2024, 'S': 2025, 'T': 2026
  };
  const year = YEAR_MAP[yearChar] || '';

  // Assembly Plant (Position 11)
  const plantChar = clean.charAt(10);
  const PLANT_MAP = {
    'W': 'Wolfsburg, Germany',
    'E': 'Emden, Germany',
    'H': 'Hannover, Germany',
    'P': 'Mosel / Zwickau, Germany',
    'B': 'Brussels, Belgium',
    'M': 'Puebla, Mexico',
    'A': 'Ingolstadt, Germany',
    'N': 'Neckarsulm, Germany',
    '1': 'Győr, Hungary',
    'K': 'Osnabrück, Germany',
    'R': 'Martorell, Spain',
    'X': 'Poznań, Poland',
    'Y': 'Pamplona, Spain',
    'D': 'Bratislava, Slovakia'
  };
  const plant = PLANT_MAP[plantChar] || `Plant ${plantChar}`;

  // Serial Number (Positions 12-17)
  const serial = clean.substring(11, 17);

  return {
    make,
    model,
    year,
    platform,
    fullModelString: `${year ? year + ' ' : ''}${model} (${platform})`,
    plant,
    serial: `#${serial}`
  };
}

// --- State Management ---
class VibesApp {
  constructor() {
    this.unit = 'kmh'; // 'kmh' | 'mph'
    this.selectedSchemaKey = 'mqb_bcm_0x09';
    this.currentSchema = BUNDLED_SCHEMAS[this.selectedSchemaKey] || BUNDLED_SCHEMAS['pq25_bcm_0x09'];
    this.selectedByteIndex = 0;
    this.vin = 'WVWZZZ5GZJW123456'; // Default MQB Golf VII baseline VIN

    // Default 30-byte baseline coding
    this.baselineHex = '000000000000000000000000000000000000000000000000000000000000';
    this.baselineBytes = hexStringToBytes(this.baselineHex);
    this.currentBytes = new Uint8Array(this.baselineBytes);
    this.hasCapturedBaseline = false;
    this._pendingFeatConfirm = null;
    this._toastTimeout = null;

    // Hardware & Logic Engines
    this.bleTransport = new WebBleTransport();
    this.udsClient = new UdsClient(this.bleTransport);
    this.safetyPipeline = new SafetyPipeline(this.bleTransport, this.udsClient);

    this.telemetryEngine = new TelemetryEngine({
      bleTransport: this.bleTransport,
      onUpdate: (data) => this.renderTelemetry(data),
      onRateUpdate: (hz) => this.renderHz(hz)
    });

    this.wakeLock = null;
    this.pendingWrite = null;
    this.lastVibrateTime = 0;
  }

  async init() {
    this.initPwaServiceWorker();
    this.setupTabs();
    this.setupBluetooth();
    this.setupWakeLock();
    this.setupGauges();
    this.setupFeatureConfirmationModal();
    this.setupFeatureCoding();
    this.setupByteMatrix();
    this.setupSafetyModal();
    this.setupBackupsTab();
    this.setupDtcsTab();
    this.setupUnitToggle();

    // Initial state: Disconnected, waiting for BLE
    this.renderTelemetry(this.telemetryEngine.getInitialMetrics());
    this.updateConnectionStatus(false);
    await this.renderBackupsList();
  }

  // --- Service Worker Registration ---
  initPwaServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('vibesODB2 SW registered with scope:', reg.scope))
          .catch(err => console.warn('vibesODB2 SW registration error:', err));
      });
    }
  }

  // --- Tabs Navigation ---
  setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const content = document.getElementById(targetTab);
        if (content) content.classList.add('active');

        if (targetTab === 'tab-backups') {
          this.renderBackupsList();
        }
      });
    });
  }

  // --- Unit Toggle (km/h vs mph) ---
  setupUnitToggle() {
    const unitToggle = document.getElementById('gauge-unit-toggle');
    if (unitToggle) {
      unitToggle.addEventListener('click', () => {
        this.unit = (this.unit === 'kmh') ? 'mph' : 'kmh';
        unitToggle.textContent = this.unit === 'kmh' ? 'KM/H' : 'MPH';
        this.vibrate([15]);
      });
    }
  }

  showToast(message, duration = 4500) {
    const toast = document.getElementById('toast-banner');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.style.display = 'none';
    }, duration);
  }

  // --- Web Bluetooth Connection ---
  setupBluetooth() {
    const bleBtn = document.getElementById('btn-ble-connect');
    const reconnectBtn = document.getElementById('btn-ble-reconnect');
    const closeHelpBtn = document.getElementById('btn-close-ble-help');
    if (closeHelpBtn) {
      closeHelpBtn.addEventListener('click', () => this.closeBleHelpModal());
    }

    const lastDev = WebBleTransport.getLastDevice();
    if (lastDev && reconnectBtn) {
      reconnectBtn.style.display = 'inline-flex';
      reconnectBtn.title = `Reconnect to ${lastDev.name}`;
      reconnectBtn.addEventListener('click', async () => {
        await this.handleBleConnect(true);
      });
    }

    this.updateNoticeBanner();

    if (bleBtn) {
      bleBtn.addEventListener('click', async () => {
        if (!WebBleTransport.isSupported()) {
          this.openBleHelpModal();
          return;
        }

        if (this.bleTransport.isConnected) {
          // Disconnect
          await this.bleTransport.disconnect();
          this.telemetryEngine.stop();
          this.updateConnectionStatus(false);
        } else {
          await this.handleBleConnect(false);
        }
      });
    }
  }

  updateNoticeBanner() {
    const noticeEl = document.getElementById('cockpit-ble-notice');
    if (!noticeEl) return;
    const support = WebBleTransport.getSupportInfo();
    const lastDev = WebBleTransport.getLastDevice();

    if (!support.supported && support.isLinux) {
      noticeEl.innerHTML = `
        <span style="font-size: 1.3rem;">🐧</span>
        <div style="flex:1;">
          <h4 style="font-size: 0.92rem; font-weight: 700; color: #f59e0b;">Web Bluetooth Disabled by Default on Linux</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            Google Chrome on Linux requires enabling experimental platform features to communicate with BLE adapters.
          </p>
          <div style="margin-top: 6px;">
            <button id="btn-show-linux-help" type="button" class="btn btn-secondary" style="padding: 3px 10px; font-size: 0.75rem;">
              🛠️ View Chrome Flag Instructions
            </button>
          </div>
        </div>
      `;
      document.getElementById('btn-show-linux-help')?.addEventListener('click', () => {
        this.openBleHelpModal();
      });
      return;
    }

    if (lastDev) {
      noticeEl.innerHTML = `
        <span style="font-size: 1.3rem;">🔄</span>
        <div style="flex:1;">
          <h4 style="font-size: 0.92rem; font-weight: 700;">Remembered Adapter: ${lastDev.name}</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
            Tap Reconnect to stream telemetry immediately, or pair a new adapter.
          </p>
          <div style="display:flex; gap:0.5rem; margin-top: 8px; flex-wrap:wrap;">
            <button id="btn-notice-reconnect" type="button" class="btn btn-primary" style="padding: 4px 12px; font-size: 0.8rem;">
              ⚡ Reconnect to ${lastDev.name}
            </button>
            <button id="btn-notice-pair" type="button" class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;">
              Pair New Adapter
            </button>
          </div>
        </div>
      `;
      document.getElementById('btn-notice-reconnect')?.addEventListener('click', () => {
        this.handleBleConnect(true);
      });
      document.getElementById('btn-notice-pair')?.addEventListener('click', () => {
        this.handleBleConnect(false);
      });
      return;
    }

    noticeEl.innerHTML = `
      <span style="font-size: 1.3rem;">⚡</span>
      <div>
        <h4 style="font-size: 0.92rem; font-weight: 700;">Bluetooth Disconnected</h4>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">
          Tap <strong>Connect BLE</strong> to pair with your OBD-II adapter and stream live powertrain telemetry.
        </p>
      </div>
    `;
  }

  async handleBleConnect(useAutoReconnect = false) {
    const bleBtn = document.getElementById('btn-ble-connect');
    const reconnectBtn = document.getElementById('btn-ble-reconnect');
    if (bleBtn) bleBtn.textContent = 'Connecting...';
    if (reconnectBtn) reconnectBtn.disabled = true;

    try {
      let result = null;
      if (useAutoReconnect && WebBleTransport.canAutoReconnect()) {
        result = await this.bleTransport.reconnectLastDevice();
      }
      if (!result) {
        result = await this.bleTransport.connect();
      }

      if (result) {
        this.updateConnectionStatus(true);
        this.vibrate([50, 50, 50]);
        // Run vehicle identification and automatic baseline snapshot
        await this.handlePostConnectSetup();
        // Start telemetry
        this.telemetryEngine.start();
      } else {
        this.updateConnectionStatus(false);
      }
    } catch (err) {
      console.error('BLE connection error:', err);
      if (err.name !== 'NotFoundError') {
        alert('Bluetooth connection cancelled or failed:\n\n' + (err.message || err));
      }
      this.updateConnectionStatus(false);
    } finally {
      if (reconnectBtn) reconnectBtn.disabled = false;
    }
  }

  async handlePostConnectSetup() {
    this.showToast("Connected to adapter! Reading vehicle identification & ECU specs...");

    try {
      // 1. Query VIN via OBD-II Mode 09 PID 02, with UDS DID 0xF190 fallback
      let vin = null;
      try {
        await this.bleTransport.setHeader('7DF');
        const vinResp = await this.bleTransport.sendCommand('0902', 2000);
        vin = this._extractVinFromResponse(vinResp);
      } catch (ve) {
        console.warn('Mode 09 VIN query error:', ve);
      }

      if (!vin) {
        try {
          await this.udsClient.setModuleAddress(this.currentSchema.module_address || '0x09');
          await this.udsClient.enterExtendedSession();
          const vinBytes = await this.udsClient.readDataById('F190');
          vin = this._extractVinFromBytes(vinBytes);
        } catch (ue) {
          console.warn('UDS VIN query fallback error:', ue);
        }
      }

      if (vin) {
        this.vin = vin;
        console.log('Vehicle VIN detected:', vin);
        // Automatic platform switching (MQB for Golf 7 / 7.5: 5G, BA, AU, BQ, 8V, etc.)
        if (/5G|BA|AU|BQ|8V|5F|5E|3G|AD|BW|7L/i.test(vin)) {
          this.selectedSchemaKey = 'mqb_bcm_0x09';
          this.currentSchema = BUNDLED_SCHEMAS[this.selectedSchemaKey];
          const sel = document.getElementById('schema-select');
          if (sel) sel.value = this.selectedSchemaKey;
        }
      }

      // 2. Query ECU Specifications (Part No, Hardware, Software, Serial No) via UDS
      let ecuPartNo = '--';
      let ecuHwNo = '--';
      let ecuSwVer = '--';
      let ecuSerial = '--';

      try {
        await this.udsClient.setModuleAddress(this.currentSchema.module_address || '0x09');
        await this.udsClient.enterExtendedSession();

        try {
          // DID 0xF187: VW Spare Part Number
          const pBytes = await this.udsClient.readDataById('F187');
          const pStr = bytesToAscii(pBytes);
          if (pStr) ecuPartNo = pStr;
        } catch (e) {}

        try {
          // DID 0xF191: ECU Hardware Number
          const hBytes = await this.udsClient.readDataById('F191');
          const hStr = bytesToAscii(hBytes);
          if (hStr) ecuHwNo = hStr;
        } catch (e) {}

        try {
          // DID 0xF189: ECU Software Version
          const sBytes = await this.udsClient.readDataById('F189');
          const sStr = bytesToAscii(sBytes);
          if (sStr) ecuSwVer = sStr;
        } catch (e) {}

        try {
          // DID 0xF18C: ECU Serial Number
          const snBytes = await this.udsClient.readDataById('F18C');
          const snStr = bytesToAscii(snBytes);
          if (snStr && snStr.length >= 4) {
            ecuSerial = snStr;
          } else if (snBytes && snBytes.length > 0) {
            ecuSerial = bytesToHexString(snBytes);
          }
        } catch (e) {}
      } catch (specErr) {
        console.warn('ECU spec query error:', specErr);
      }

      // Update Vehicle Specs Card in Cockpit
      this.updateVehicleSpecsDisplay({
        vin: this.vin,
        ecuPartNo,
        ecuHwNo,
        ecuSwVer,
        ecuSerial
      });

      // 3. Read live Long Coding from target module (BCM 0x09, DID 0x0600)
      let liveCoding = null;
      try {
        await this.udsClient.setModuleAddress(this.currentSchema.module_address || '0x09');
        await this.udsClient.enterExtendedSession();
        const readDid = this.currentSchema.coding_did || '0600';
        liveCoding = await this.udsClient.readDataById(readDid);
      } catch (ce) {
        console.warn('UDS Long Coding read error:', ce);
      }

      if (liveCoding && liveCoding.length >= 10) {
        this.baselineBytes = new Uint8Array(liveCoding);
        this.currentBytes = new Uint8Array(liveCoding);
        this.baselineHex = bytesToHexString(this.baselineBytes);
      }

      // 4. Automatically capture Baseline Snapshot #1 on first connect
      const backup = await saveBackup({
        vin: this.vin,
        moduleAddress: this.currentSchema.module_address || '0x09',
        did: this.currentSchema.coding_did || '0x0600',
        featureName: 'Initial Connect Baseline Snapshot (Auto-Protected)',
        rawHexData: bytesToHexString(this.baselineBytes),
        timestamp: new Date().toISOString()
      });

      this.hasCapturedBaseline = true;
      this.showToast(`🛡️ Baseline Snapshot #${backup.id} automatically captured! Factory coding safely stored.`);
      this.renderBackupsList();
      this.renderByteGrid();
      this.renderBitSwitches();
      this.renderFeatureList();
    } catch (err) {
      console.warn('Post-connect setup fallback:', err);
      try {
        const backup = await saveBackup({
          vin: this.vin,
          moduleAddress: this.currentSchema.module_address || '0x09',
          did: this.currentSchema.coding_did || '0x0600',
          featureName: 'Initial Connect Baseline Snapshot (Fallback)',
          rawHexData: bytesToHexString(this.baselineBytes),
          timestamp: new Date().toISOString()
        });
        this.renderBackupsList();
      } catch (e) {}
    }
  }

  updateVehicleSpecsDisplay(specs) {
    const decoded = decodeVin(specs.vin);

    const elModel = document.getElementById('info-vehicle-model');
    const elVin = document.getElementById('info-vehicle-vin');
    const elSerial = document.getElementById('info-vehicle-serial');
    const elPlant = document.getElementById('info-vehicle-plant');
    const elPart = document.getElementById('info-ecu-part');
    const elHw = document.getElementById('info-ecu-hw');
    const elSw = document.getElementById('info-ecu-sw');
    const elEcuSerial = document.getElementById('info-ecu-serial');
    const elBadge = document.getElementById('vehicle-detected-badge');

    if (elVin) elVin.textContent = specs.vin || '--';
    if (elPart) elPart.textContent = specs.ecuPartNo || '--';
    if (elHw) elHw.textContent = specs.ecuHwNo || '--';
    if (elSw) elSw.textContent = specs.ecuSwVer || '--';
    if (elEcuSerial) elEcuSerial.textContent = specs.ecuSerial || '--';

    if (decoded) {
      if (elModel) elModel.textContent = decoded.fullModelString || decoded.model || '--';
      if (elSerial) elSerial.textContent = decoded.serial || '--';
      if (elPlant) elPlant.textContent = decoded.plant || '--';
    } else {
      if (elModel) elModel.textContent = this.currentSchema?.platform ? `VAG (${this.currentSchema.platform})` : 'Connected VAG Vehicle';
      if (elSerial) elSerial.textContent = '--';
      if (elPlant) elPlant.textContent = '--';
    }

    if (elBadge) {
      elBadge.textContent = 'Connected • Live UDS';
      elBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      elBadge.style.color = '#34d399';
      elBadge.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    }
  }

  clearVehicleSpecsDisplay() {
    const elModel = document.getElementById('info-vehicle-model');
    const elVin = document.getElementById('info-vehicle-vin');
    const elSerial = document.getElementById('info-vehicle-serial');
    const elPlant = document.getElementById('info-vehicle-plant');
    const elPart = document.getElementById('info-ecu-part');
    const elHw = document.getElementById('info-ecu-hw');
    const elSw = document.getElementById('info-ecu-sw');
    const elEcuSerial = document.getElementById('info-ecu-serial');
    const elBadge = document.getElementById('vehicle-detected-badge');

    if (elModel) elModel.textContent = '--';
    if (elVin) elVin.textContent = '--';
    if (elSerial) elSerial.textContent = '--';
    if (elPlant) elPlant.textContent = '--';
    if (elPart) elPart.textContent = '--';
    if (elHw) elHw.textContent = '--';
    if (elSw) elSw.textContent = '--';
    if (elEcuSerial) elEcuSerial.textContent = '--';
    if (elBadge) {
      elBadge.textContent = 'Disconnected';
      elBadge.style.background = 'rgba(100, 116, 139, 0.2)';
      elBadge.style.color = '#94a3b8';
      elBadge.style.border = 'none';
    }
  }

  _extractVinFromBytes(rawBytes) {
    if (!rawBytes) return null;
    const str = bytesToAscii(rawBytes);
    const match = str.match(/[A-HJ-NPR-Z0-9]{17}/);
    return match ? match[0] : null;
  }

  _extractVinFromResponse(resp) {
    if (!resp) return null;
    const clean = resp.replace(/>/g, ' ').toUpperCase();
    const parts = clean.split(/\s+/).filter(p => /^[0-9A-F]{2}$/.test(p));
    let ascii = '';
    for (const hex of parts) {
      const byte = parseInt(hex, 16);
      if (byte >= 32 && byte <= 126) {
        ascii += String.fromCharCode(byte);
      }
    }
    const vinMatch = ascii.match(/[A-HJ-NPR-Z0-9]{17}/);
    return vinMatch ? vinMatch[0] : null;
  }

  setupFeatureConfirmationModal() {
    const cancelBtn = document.getElementById('btn-feat-confirm-cancel');
    const proceedBtn = document.getElementById('btn-feat-confirm-proceed');
    const modal = document.getElementById('modal-feature-confirm');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (this._pendingFeatConfirm?.onCancel) {
          this._pendingFeatConfirm.onCancel();
        }
        this._pendingFeatConfirm = null;
        modal.classList.remove('active');
      });
    }

    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        const pending = this._pendingFeatConfirm;
        this._pendingFeatConfirm = null;
        modal.classList.remove('active');
        if (pending?.onProceed) {
          pending.onProceed();
        }
      });
    }
  }

  confirmFeatureToggle({ feature, targetState, origState, onProceed, onCancel }) {
    const modal = document.getElementById('modal-feature-confirm');
    if (!modal) {
      // Fallback to native window.confirm if modal element not found
      const origText = origState ? 'Enabled (ON)' : 'Disabled (OFF)';
      const newText = targetState ? 'Enabled (ON)' : 'Disabled (OFF)';
      const ok = window.confirm(`Are you sure you want to change "${feature.name}"?\n\nOriginal State: ${origText}\nNew State: ${newText}`);
      if (ok) onProceed(); else onCancel();
      return;
    }

    this._pendingFeatConfirm = { onProceed, onCancel };

    document.getElementById('confirm-feat-name').textContent = feature.name;
    document.getElementById('confirm-feat-orig').textContent = origState ? 'Enabled (ON)' : 'Disabled (OFF)';
    document.getElementById('confirm-feat-new').textContent = targetState ? 'Enabled (ON)' : 'Disabled (OFF)';
    document.getElementById('confirm-feat-loc').textContent = `Byte ${feature.byte}, Bit ${feature.bit} (Module ${this.currentSchema.module_address || '0x09'})`;

    modal.classList.add('active');
  }

  openBleHelpModal() {
    const modal = document.getElementById('modal-ble-help');
    if (modal) modal.classList.add('active');
  }

  closeBleHelpModal() {
    const modal = document.getElementById('modal-ble-help');
    if (modal) modal.classList.remove('active');
  }

  updateConnectionStatus(connected) {
    const bleBtn = document.getElementById('btn-ble-connect');
    const reconnectBtn = document.getElementById('btn-ble-reconnect');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    const cockpitNotice = document.getElementById('cockpit-ble-notice');
    const codingNotice = document.getElementById('coding-ble-notice');
    const matrixNotice = document.getElementById('matrix-ble-notice');
    const dtcsNotice = document.getElementById('dtcs-ble-notice');

    const scanBtn = document.getElementById('btn-scan-dtcs');
    const clearBtn = document.getElementById('btn-clear-dtcs');
    const applyHexBtn = document.getElementById('btn-apply-hex');
    const resetHexBtn = document.getElementById('btn-reset-hex');
    const rawHexInput = document.getElementById('raw-hex-input');

    if (connected) {
      if (bleBtn) {
        bleBtn.classList.add('connected');
        bleBtn.textContent = 'Disconnect BLE';
      }
      if (reconnectBtn) {
        reconnectBtn.style.display = 'none';
      }
      if (statusDot) {
        statusDot.className = 'dot connected';
      }
      if (statusText) {
        statusText.textContent = this.bleTransport.device?.name || 'BLE Connected';
      }
      if (cockpitNotice) cockpitNotice.style.display = 'none';
      if (codingNotice) codingNotice.style.display = 'none';
      if (matrixNotice) matrixNotice.style.display = 'none';
      if (dtcsNotice) dtcsNotice.style.display = 'none';

      if (scanBtn) { scanBtn.disabled = false; scanBtn.title = 'Scan ECU Fault Codes'; }
      if (clearBtn) { clearBtn.disabled = false; clearBtn.title = 'Clear All DTCs'; }
      if (applyHexBtn) { applyHexBtn.disabled = false; applyHexBtn.title = 'Audit & Write Hex'; }
      if (resetHexBtn) { resetHexBtn.disabled = false; resetHexBtn.title = 'Reset to Baseline'; }
      if (rawHexInput) rawHexInput.readOnly = false;
    } else {
      if (bleBtn) {
        bleBtn.classList.remove('connected');
        bleBtn.textContent = 'Connect BLE';
      }
      const lastDev = WebBleTransport.getLastDevice();
      if (reconnectBtn && lastDev) {
        reconnectBtn.style.display = 'inline-flex';
      }
      if (statusDot) {
        statusDot.className = 'dot';
      }
      if (statusText) {
        statusText.textContent = 'Disconnected';
      }
      if (cockpitNotice) {
        cockpitNotice.style.display = 'block';
        this.updateNoticeBanner();
      }
      if (codingNotice) codingNotice.style.display = 'block';
      if (matrixNotice) matrixNotice.style.display = 'block';
      if (dtcsNotice) dtcsNotice.style.display = 'block';

      if (scanBtn) { scanBtn.disabled = true; scanBtn.title = 'Connect Bluetooth to scan DTCs'; }
      if (clearBtn) { clearBtn.disabled = true; clearBtn.title = 'Connect Bluetooth to clear DTCs'; }
      if (applyHexBtn) { applyHexBtn.disabled = true; applyHexBtn.title = 'Connect Bluetooth to write hex'; }
      if (resetHexBtn) { resetHexBtn.disabled = true; resetHexBtn.title = 'Connect Bluetooth to reset baseline'; }
      if (rawHexInput) rawHexInput.readOnly = true;

      // Clear cockpit telemetry metrics & vehicle specs when disconnected
      this.renderTelemetry({});
      this.clearVehicleSpecsDisplay();
    }

    // Refresh UI components to reflect updated disabled/enabled interactive states
    this.renderFeatureList();
    this.renderBitSwitches();
    this.renderBackupsList();
  }

  // --- Screen Wake Lock API ---
  setupWakeLock() {
    const wakeBtn = document.getElementById('btn-wake-lock');
    if (!wakeBtn) return;

    wakeBtn.addEventListener('click', async () => {
      if (!('wakeLock' in navigator)) {
        alert('Screen Wake Lock API is not supported in this browser.');
        return;
      }

      if (this.wakeLock !== null) {
        await this.wakeLock.release();
        this.wakeLock = null;
        wakeBtn.textContent = 'Screen Lock: Off';
        wakeBtn.classList.remove('active');
      } else {
        try {
          this.wakeLock = await navigator.wakeLock.request('screen');
          wakeBtn.textContent = 'Screen Lock: ON';
          wakeBtn.classList.add('active');
          this.wakeLock.addEventListener('release', () => {
            this.wakeLock = null;
            wakeBtn.textContent = 'Screen Lock: Off';
            wakeBtn.classList.remove('active');
          });
        } catch (err) {
          console.warn('Wake Lock request failed:', err);
        }
      }
    });
  }

  // --- Haptic Feedback API ---
  vibrate(pattern) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignore haptic errors on unsupported hardware
      }
    }
  }

  // --- SVG Radial Gauges Setup & Render ---
  setupGauges() {
    const svg = document.getElementById('tachometer-svg');
    if (!svg) return;

    // Build SVG Tachometer Arc (center 120, 120, radius 90, span 240 degrees from 150° to 390°)
    const cx = 120;
    const cy = 120;
    const r = 90;

    // Background track arc (135° to 405° = 270° span)
    const bgArc = this.describeArc(cx, cy, r, 135, 405);
    const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bgPath.setAttribute('d', bgArc);
    bgPath.setAttribute('fill', 'none');
    bgPath.setAttribute('stroke', '#1e293b');
    bgPath.setAttribute('stroke-width', '12');
    bgPath.setAttribute('stroke-linecap', 'round');
    svg.appendChild(bgPath);

    // Active RPM Arc
    const activePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    activePath.setAttribute('id', 'rpm-arc-path');
    activePath.setAttribute('d', this.describeArc(cx, cy, r, 135, 135.1));
    activePath.setAttribute('fill', 'none');
    activePath.setAttribute('stroke', 'url(#rpm-gradient)');
    activePath.setAttribute('stroke-width', '12');
    activePath.setAttribute('stroke-linecap', 'round');
    svg.appendChild(activePath);

    // Gradient definition
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="rpm-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0284c7" />
        <stop offset="60%" stop-color="#38bdf8" />
        <stop offset="85%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#ef4444" />
      </linearGradient>
    `;
    svg.appendChild(defs);

    // Minor tick marks
    for (let rpm = 0; rpm <= 6000; rpm += 1000) {
      const angle = 135 + (rpm / 6000.0) * 270;
      const rad = (angle * Math.PI) / 180.0;
      const x1 = cx + (r - 12) * Math.cos(rad);
      const y1 = cy + (r - 12) * Math.sin(rad);
      const x2 = cx + (r - 20) * Math.cos(rad);
      const y2 = cy + (r - 20) * Math.sin(rad);

      const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tick.setAttribute('x1', x1);
      tick.setAttribute('y1', y1);
      tick.setAttribute('x2', x2);
      tick.setAttribute('y2', y2);
      tick.setAttribute('stroke', rpm >= 5000 ? '#ef4444' : '#64748b');
      tick.setAttribute('stroke-width', '2');
      svg.appendChild(tick);
    }
  }

  polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  }

  describeArc(x, y, radius, startAngle, endAngle) {
    const start = this.polarToCartesian(x, y, radius, startAngle);
    const end = this.polarToCartesian(x, y, radius, endAngle);
    const largeArcFlag = (endAngle - startAngle) > 180 ? '1' : '0';
    return [
      'M', start.x.toFixed(2), start.y.toFixed(2),
      'A', radius, radius, 0, largeArcFlag, 1, end.x.toFixed(2), end.y.toFixed(2)
    ].join(' ');
  }

  renderTelemetry(data) {
    // 1. Speed
    const speedEl = document.getElementById('gauge-speed-val');
    if (speedEl) {
      if (data.vehicle_speed_kmh != null) {
        const speedVal = this.unit === 'mph' 
          ? Math.round(data.vehicle_speed_kmh * 0.621371) 
          : Math.round(data.vehicle_speed_kmh);
        speedEl.textContent = speedVal;
      } else {
        speedEl.textContent = '0';
      }
    }

    // 2. RPM & Arc
    const rpmEl = document.getElementById('gauge-rpm-val');
    const rpm = (data.engine_rpm != null) ? Math.max(0, Math.min(6000, data.engine_rpm)) : 0;
    if (rpmEl) {
      rpmEl.textContent = `${Math.round(rpm)} RPM`;
      if (rpm >= 5000) {
        rpmEl.style.color = '#ef4444';
        // Haptic feedback at redline once every 1.5s
        if (Date.now() - this.lastVibrateTime > 1500) {
          this.vibrate([80, 40, 80]);
          this.lastVibrateTime = Date.now();
        }
      } else {
        rpmEl.style.color = 'var(--primary-light)';
      }
    }

    const arcPath = document.getElementById('rpm-arc-path');
    if (arcPath) {
      const startAngle = 135;
      const currentAngle = 135 + (rpm / 6000.0) * 270;
      arcPath.setAttribute('d', this.describeArc(120, 120, 90, startAngle, Math.max(startAngle + 0.1, currentAngle)));
    }

    // 3. Gear Badge
    const gearEl = document.getElementById('gauge-gear-val');
    if (gearEl) {
      gearEl.textContent = data.engaged_gear || data.gear || '--';
    }

    // 4. Boost Pressure
    const boostValEl = document.getElementById('metric-boost-val');
    const boostBarEl = document.getElementById('progress-boost');
    if (boostValEl) {
      boostValEl.textContent = data.boost_pressure_bar != null 
        ? `${data.boost_pressure_bar.toFixed(2)} bar` 
        : '-- bar';
    }
    if (boostBarEl) {
      const pct = data.boost_pressure_bar != null 
        ? Math.min(100, Math.max(0, (data.boost_pressure_bar / 2.0) * 100)) 
        : 0;
      boostBarEl.style.width = `${pct}%`;
    }

    // 5. Coolant Temp
    const coolantValEl = document.getElementById('metric-coolant-val');
    const coolantBarEl = document.getElementById('progress-coolant');
    if (coolantValEl) {
      coolantValEl.textContent = data.coolant_temp_c != null 
        ? `${Math.round(data.coolant_temp_c)} °C` 
        : '-- °C';
    }
    if (coolantBarEl) {
      const pct = data.coolant_temp_c != null 
        ? Math.min(100, Math.max(0, ((data.coolant_temp_c - 40) / 80) * 100)) 
        : 0;
      coolantBarEl.style.width = `${pct}%`;
      if (data.coolant_temp_c != null && data.coolant_temp_c >= 105) {
        coolantBarEl.style.background = '#ef4444';
      } else {
        coolantBarEl.style.background = '';
      }
    }

    // 6. Intake Air Temp (IAT)
    const iatEl = document.getElementById('metric-iat-val');
    if (iatEl) {
      iatEl.textContent = data.intake_air_temp_c != null 
        ? `${Math.round(data.intake_air_temp_c)} °C` 
        : '-- °C';
    }

    // 7. Exhaust Gas Temp (EGT)
    const egtEl = document.getElementById('metric-egt-val');
    const egtVal = data.exhaust_gas_temp_c !== undefined ? data.exhaust_gas_temp_c : data.egt_c;
    if (egtEl) {
      egtEl.textContent = egtVal != null 
        ? `${Math.round(egtVal)} °C` 
        : '-- °C';
    }

    // 8. DPF Soot Load
    const sootValEl = document.getElementById('metric-soot-val');
    const sootBarEl = document.getElementById('progress-soot');
    if (sootValEl) {
      if (data.dpf_soot_load_g != null) {
        sootValEl.textContent = `${data.dpf_soot_load_g.toFixed(1)} g`;
        sootValEl.style.color = 'var(--warning)';
      } else {
        sootValEl.textContent = '-- g';
        sootValEl.style.color = 'var(--text-muted)';
      }
    }
    if (sootBarEl) {
      const pct = data.dpf_soot_load_g != null 
        ? Math.min(100, Math.max(0, (data.dpf_soot_load_g / 45.0) * 100)) 
        : 0;
      sootBarEl.style.width = `${pct}%`;
    }

    // 9. Throttle Position
    const throttleEl = document.getElementById('metric-throttle-val');
    if (throttleEl) {
      throttleEl.textContent = data.throttle_position_pct != null 
        ? `${Math.round(data.throttle_position_pct)}%` 
        : '-- %';
    }
  }

  renderHz(rateData) {
    const hzEl = document.getElementById('telemetry-hz');
    if (hzEl) {
      const hzVal = (rateData && typeof rateData === 'object') ? rateData.hz : rateData;
      hzEl.textContent = `${Number(hzVal || 0).toFixed(1)} Hz`;
    }
  }

  // --- Feature Coding Tab ---
  setupFeatureCoding() {
    const schemaSelect = document.getElementById('schema-select');
    if (schemaSelect) {
      schemaSelect.innerHTML = '';
      Object.keys(BUNDLED_SCHEMAS).forEach(key => {
        const sch = BUNDLED_SCHEMAS[key];
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = `[${sch.platform}] Address ${sch.module_address} - ${sch.features?.length || 0} features`;
        if (key === this.selectedSchemaKey) opt.selected = true;
        schemaSelect.appendChild(opt);
      });

      schemaSelect.addEventListener('change', (e) => {
        this.selectedSchemaKey = e.target.value;
        this.currentSchema = BUNDLED_SCHEMAS[this.selectedSchemaKey];
        // Resize buffer if needed
        const reqLen = this.currentSchema.expected_byte_length || 30;
        if (this.currentBytes.length !== reqLen) {
          const newBuf = new Uint8Array(reqLen);
          newBuf.set(this.currentBytes.subarray(0, Math.min(this.currentBytes.length, reqLen)));
          this.currentBytes = newBuf;
        }
        this.renderFeatureList();
        this.renderByteGrid();
        this.renderBitSwitches();
      });
    }

    this.renderFeatureList();
  }

  renderFeatureList() {
    const container = document.getElementById('feature-list-container');
    if (!container) return;
    container.innerHTML = '';

    const features = this.currentSchema.features || [];
    if (features.length === 0) {
      container.innerHTML = '<p class="text-muted">No predefined feature toggles for this module. Use the Byte Matrix tab for manual bitwise coding.</p>';
      return;
    }

    features.forEach(feat => {
      const isEnabled = (this.currentBytes[feat.byte] & (1 << feat.bit)) !== 0;
      const wasOriginalEnabled = (this.baselineBytes[feat.byte] & (1 << feat.bit)) !== 0;
      const isModified = (isEnabled !== wasOriginalEnabled);

      const item = document.createElement('div');
      item.className = `feature-item ${isModified ? 'feature-item-modified' : ''}`;
      if (isModified) {
        item.style.borderLeft = '3px solid var(--warning)';
        item.style.background = 'rgba(245, 158, 11, 0.05)';
      }

      const info = document.createElement('div');
      info.className = 'feature-info';

      let stateBadgeHtml = '';
      if (isModified) {
        stateBadgeHtml = `
          <span style="display:inline-flex; align-items:center; gap:4px; font-size:0.72rem; padding:2px 6px; border-radius:4px; background:rgba(245, 158, 11, 0.2); color:#fbbf24; font-weight:700; border:1px solid rgba(245,158,11,0.4); margin-left:6px;">
            ⚠️ Modified (Was: ${wasOriginalEnabled ? 'ON' : 'OFF'} ➔ Now: ${isEnabled ? 'ON' : 'OFF'})
          </span>
        `;
      } else {
        stateBadgeHtml = `
          <span style="display:inline-flex; align-items:center; font-size:0.7rem; padding:1px 5px; border-radius:3px; background:rgba(100, 116, 139, 0.2); color:#94a3b8; margin-left:6px;">
            Original: ${wasOriginalEnabled ? 'ON' : 'OFF'}
          </span>
        `;
      }

      info.innerHTML = `
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
          <h4 style="margin:0;">${feat.name}</h4>
          ${stateBadgeHtml}
        </div>
        <p style="margin:4px 0 2px 0;">${feat.description || ''}</p>
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size: 0.72rem; color: #64748b; font-family: var(--font-mono)">
            [Byte ${feat.byte}, Bit ${feat.bit}] ${feat.prerequisites ? '• ' + feat.prerequisites : ''}
          </span>
          ${isModified ? `<button type="button" class="btn-revert-feature" style="background:none; border:none; color:#38bdf8; font-size:0.72rem; cursor:pointer; text-decoration:underline; padding:0;">↺ Revert to Original (${wasOriginalEnabled ? 'ON' : 'OFF'})</button>` : ''}
        </div>
      `;

      const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);

      if (isModified) {
        const revertBtn = info.querySelector('.btn-revert-feature');
        if (revertBtn) {
          if (!isConnected) {
            revertBtn.disabled = true;
            revertBtn.style.opacity = '0.38';
            revertBtn.style.cursor = 'not-allowed';
            revertBtn.title = 'Connect Bluetooth to revert feature';
          } else {
            revertBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (wasOriginalEnabled) {
                this.currentBytes[feat.byte] |= (1 << feat.bit);
              } else {
                this.currentBytes[feat.byte] &= ~(1 << feat.bit);
              }
              this.renderFeatureList();
              this.renderByteGrid();
              this.renderBitSwitches();
            });
          }
        }
      }

      const toggleLabel = document.createElement('label');
      toggleLabel.className = `toggle-switch ${!isConnected ? 'disabled' : ''}`;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isEnabled;
      if (!isConnected) {
        checkbox.disabled = true;
        checkbox.title = 'Connect Bluetooth to toggle vehicle coding';
      }

      const slider = document.createElement('span');
      slider.className = 'slider';

      checkbox.addEventListener('change', () => {
        const targetState = checkbox.checked;
        const origState = wasOriginalEnabled;

        this.confirmFeatureToggle({
          feature: feat,
          targetState,
          origState,
          onProceed: () => {
            // Clone current bytes
            const modifiedBytes = new Uint8Array(this.currentBytes);
            if (targetState) {
              modifiedBytes[feat.byte] |= (1 << feat.bit);
            } else {
              modifiedBytes[feat.byte] &= ~(1 << feat.bit);
            }

            // Request Pre-Write Safety Audit Modal
            this.promptSafetyAudit({
              featureName: feat.name,
              modifiedBytes,
              onSuccess: () => {
                this.currentBytes = modifiedBytes;
                this.renderFeatureList();
                this.renderByteGrid();
                this.renderBitSwitches();
                this.vibrate([40, 20, 40]);
              },
              onCancel: () => {
                checkbox.checked = !targetState; // Revert
              }
            });
          },
          onCancel: () => {
            checkbox.checked = !targetState; // Revert switch
          }
        });
      });

      toggleLabel.appendChild(checkbox);
      toggleLabel.appendChild(slider);

      item.appendChild(info);
      item.appendChild(toggleLabel);
      container.appendChild(item);
    });
  }

  // --- Interactive Byte Matrix Tab ---
  setupByteMatrix() {
    const rawInput = document.getElementById('raw-hex-input');
    const applyBtn = document.getElementById('btn-apply-hex');
    const resetBtn = document.getElementById('btn-reset-hex');

    if (rawInput) {
      rawInput.value = bytesToHexString(this.currentBytes);
    }

    if (applyBtn && rawInput) {
      applyBtn.addEventListener('click', () => {
        try {
          const modBytes = hexStringToBytes(rawInput.value);
          if (modBytes.length !== this.currentBytes.length) {
            alert(`Payload length mismatch! Expected ${this.currentBytes.length} bytes, got ${modBytes.length}`);
            return;
          }

          this.promptSafetyAudit({
            featureName: 'Manual Byte Matrix Edit',
            modifiedBytes: modBytes,
            onSuccess: () => {
              this.currentBytes = modBytes;
              this.renderFeatureList();
              this.renderByteGrid();
              this.renderBitSwitches();
              this.vibrate([50]);
            },
            onCancel: () => {
              rawInput.value = bytesToHexString(this.currentBytes);
            }
          });
        } catch (err) {
          alert('Invalid Hex string: ' + err.message);
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset all bytes to initial baseline snapshot?')) {
          this.currentBytes = hexStringToBytes(this.baselineHex);
          if (rawInput) rawInput.value = bytesToHexString(this.currentBytes);
          this.renderFeatureList();
          this.renderByteGrid();
          this.renderBitSwitches();
          this.vibrate([25]);
        }
      });
    }

    this.renderByteGrid();
    this.renderBitSwitches();
  }

  renderByteGrid() {
    const grid = document.getElementById('byte-grid-container');
    const rawInput = document.getElementById('raw-hex-input');
    if (rawInput) {
      rawInput.value = bytesToHexString(this.currentBytes);
    }
    if (!grid) return;

    grid.innerHTML = '';
    for (let i = 0; i < this.currentBytes.length; i++) {
      const cell = document.createElement('div');
      cell.className = `byte-cell ${i === this.selectedByteIndex ? 'selected' : ''}`;
      cell.innerHTML = `
        <div style="font-size: 0.65rem; color: #64748b;">${i}</div>
        <div>${this.currentBytes[i].toString(16).padStart(2, '0').toUpperCase()}</div>
      `;
      cell.addEventListener('click', () => {
        this.selectedByteIndex = i;
        this.renderByteGrid();
        this.renderBitSwitches();
        this.vibrate([15]);
      });
      grid.appendChild(cell);
    }
  }

  renderBitSwitches() {
    const bitContainer = document.getElementById('bit-switches-container');
    const byteIndexLabel = document.getElementById('selected-byte-index');
    if (byteIndexLabel) {
      byteIndexLabel.textContent = `Byte ${this.selectedByteIndex} (0x${this.currentBytes[this.selectedByteIndex].toString(16).padStart(2, '0').toUpperCase()})`;
    }
    if (!bitContainer) return;

    bitContainer.innerHTML = '';
    const currentVal = this.currentBytes[this.selectedByteIndex];

    const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);

    for (let bit = 7; bit >= 0; bit--) {
      const isBitSet = (currentVal & (1 << bit)) !== 0;
      const btn = document.createElement('button');
      btn.className = `bit-btn ${isBitSet ? 'active' : ''} ${!isConnected ? 'disabled' : ''}`;
      if (!isConnected) {
        btn.disabled = true;
        btn.title = 'Connect Bluetooth to toggle bits';
      }
      btn.innerHTML = `<div>Bit ${bit}</div><div style="font-size: 1.1rem; margin-top:2px;">${isBitSet ? '1' : '0'}</div>`;

      btn.addEventListener('click', () => {
        const modBytes = new Uint8Array(this.currentBytes);
        if (isBitSet) {
          modBytes[this.selectedByteIndex] &= ~(1 << bit);
        } else {
          modBytes[this.selectedByteIndex] |= (1 << bit);
        }

        this.promptSafetyAudit({
          featureName: `Toggle Byte ${this.selectedByteIndex} Bit ${bit}`,
          modifiedBytes: modBytes,
          onSuccess: () => {
            this.currentBytes = modBytes;
            this.renderFeatureList();
            this.renderByteGrid();
            this.renderBitSwitches();
            this.vibrate([30]);
          },
          onCancel: () => {}
        });
      });

      bitContainer.appendChild(btn);
    }
  }

  // --- Pre-Write Safety Audit Pipeline & Modal ---
  setupSafetyModal() {
    const modal = document.getElementById('modal-safety-audit');
    const confirmBtn = document.getElementById('btn-modal-confirm');
    const cancelBtn = document.getElementById('btn-modal-cancel');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (modal) modal.classList.remove('active');
        if (this.pendingWrite && this.pendingWrite.onCancel) {
          this.pendingWrite.onCancel();
        }
        this.pendingWrite = null;
      });
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        if (!this.pendingWrite) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Writing to ECU...';

        try {
          // Perform Safety Pipeline Pre-Write Audit & Backup
          const auditResult = await this.safetyPipeline.preWriteAudit({
            vin: this.vin,
            targetModule: this.currentSchema.module_address,
            did: this.currentSchema.coding_did,
            baselineHex: bytesToHexString(this.currentBytes),
            modifiedHex: bytesToHexString(this.pendingWrite.modifiedBytes),
            expectedByteLength: this.currentSchema.expected_byte_length || 30
          });

          if (!auditResult.passed) {
            alert('Safety Check Failed: ' + auditResult.errors.join('\n'));
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm & Write to ECU';
            return;
          }

          // Execute UDS Write
          if (!this.bleTransport.isConnected) {
            alert('Cannot write to ECU: Bluetooth adapter is not connected. Please connect your OBD-II adapter first.');
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm & Write to ECU';
            return;
          }

          await this.udsClient.enterExtendedSession();
          await this.udsClient.writeDataById(
            this.currentSchema.coding_did,
            this.pendingWrite.modifiedBytes
          );

          // Complete transaction
          if (this.pendingWrite.onSuccess) {
            this.pendingWrite.onSuccess();
          }

          if (modal) modal.classList.remove('active');
          alert('Coding applied successfully! Pre-write snapshot saved to local storage.');
          this.renderBackupsList();
        } catch (err) {
          console.error('ECU write error:', err);
          alert('UDS Write Error: ' + (err.message || err));
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Confirm & Write to ECU';
          this.pendingWrite = null;
        }
      });
    }
  }

  async promptSafetyAudit({ featureName, modifiedBytes, onSuccess, onCancel }) {
    this.pendingWrite = { featureName, modifiedBytes, onSuccess, onCancel };
    const modal = document.getElementById('modal-safety-audit');
    if (!modal) return;

    // Calculate Diffs
    const diffs = computeByteDiff(this.currentBytes, modifiedBytes);
    const diffContainer = document.getElementById('modal-diff-summary');
    if (diffContainer) {
      if (diffs.length === 0) {
        diffContainer.innerHTML = '<p class="text-muted">No byte alterations detected.</p>';
      } else {
        let diffHtml = '<div style="background:#070a12; padding:8px 12px; border-radius:6px; font-family:var(--font-mono); font-size:0.8rem;">';
        diffs.forEach(d => {
          const bitNotes = d.bitFlips.map(f => `Bit ${f.bit}: ${f.oldVal ? '1' : '0'} &rarr; ${f.newVal ? '1' : '0'}`).join(', ');
          diffHtml += `<div style="margin-bottom:4px;"><strong style="color:var(--primary-light)">Byte ${d.byteIndex}:</strong> 0x${d.oldHex} &rarr; <span style="color:var(--success); font-weight:700;">0x${d.newHex}</span> (${bitNotes})</div>`;
        });
        diffHtml += '</div>';
        diffContainer.innerHTML = diffHtml;
      }
    }

    // Live Engine Status Interlock check
    const currentRpm = this.telemetryEngine.latestMetrics.engine_rpm || 0;
    const rpmCheckIcon = document.getElementById('check-rpm-icon');
    const rpmCheckDesc = document.getElementById('check-rpm-desc');
    if (currentRpm > 0) {
      if (rpmCheckIcon) rpmCheckIcon.innerHTML = '⚠️';
      if (rpmCheckDesc) {
        rpmCheckDesc.textContent = `Warning: Engine is detected running (${Math.round(currentRpm)} RPM). UDS requires ignition ON, engine OFF.`;
        rpmCheckDesc.style.color = 'var(--warning)';
      }
    } else {
      if (rpmCheckIcon) rpmCheckIcon.innerHTML = '✅';
      if (rpmCheckDesc) {
        rpmCheckDesc.textContent = 'Engine Speed = 0 RPM (Ignition ON, Engine OFF). Interlock passed.';
        rpmCheckDesc.style.color = 'var(--text-muted)';
      }
    }

    modal.classList.add('active');
  }

  // --- Backups Management Tab ---
  setupBackupsTab() {
    const exportBtn = document.getElementById('btn-export-backups');
    const importBtn = document.getElementById('btn-import-backups');
    const importInput = document.getElementById('input-import-backups');

    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        const json = await exportBackupsJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `vibesodb2_backups_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        const imported = await importBackupsJson(text);
        alert(`Successfully imported ${imported.length} backup records.`);
        this.renderBackupsList();
        importInput.value = '';
      });
    }
  }

  async renderBackupsList() {
    const container = document.getElementById('backups-list-container');
    if (!container) return;
    const backups = await getBackups();

    if (backups.length === 0) {
      container.innerHTML = '<p class="text-muted" style="padding:1rem;">No backups saved yet. A snapshot will be generated automatically before any coding write.</p>';
      return;
    }

    const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);

    container.innerHTML = '';
    backups.slice().reverse().forEach(b => {
      const item = document.createElement('div');
      item.className = 'card';
      item.style.marginBottom = '0.75rem';

      const dateStr = new Date(b.timestamp).toLocaleString();
      const rawHex = b.raw_hex_data || b.baselineHex || '';
      const modAddr = b.module_address || b.targetModule || '0x09';
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
          <div>
            <h4 style="font-size:0.95rem; font-weight:700;">VIN: ${b.vin} • Module ${modAddr}</h4>
            <span style="font-size:0.75rem; color:#64748b;">${dateStr} • DID ${b.did}</span>
          </div>
          <button class="btn btn-secondary" style="font-size:0.75rem; padding:4px 8px;" id="btn-restore-${b.id}" ${!isConnected ? 'disabled title="Connect Bluetooth to restore snapshot"' : ''}>Restore</button>
        </div>
        <div style="font-family:var(--font-mono); font-size:0.75rem; color:#94a3b8; word-break:break-all; background:#070a12; padding:6px 10px; border-radius:6px;">
          ${rawHex}
        </div>
      `;

      container.appendChild(item);

      const restoreBtn = item.querySelector(`#btn-restore-${b.id}`);
      if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
          const modBytes = hexStringToBytes(rawHex);
          this.promptSafetyAudit({
            featureName: `Restore Snapshot from ${dateStr}`,
            modifiedBytes: modBytes,
            onSuccess: () => {
              this.currentBytes = modBytes;
              this.renderFeatureList();
              this.renderByteGrid();
              this.renderBitSwitches();
              this.vibrate([40, 20, 40]);
            },
            onCancel: () => {}
          });
        });
      }
    });
  }

  // --- Diagnostic Trouble Codes (DTC) Tab ---
  setupDtcsTab() {
    const scanBtn = document.getElementById('btn-scan-dtcs');
    const clearBtn = document.getElementById('btn-clear-dtcs');

    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Cannot scan DTCs: Bluetooth OBD-II adapter is not connected. Please connect your adapter first.');
          return;
        }

        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning ECU...';

        try {
          const dtcs = await this.udsClient.readDTCs();
          this.renderDtcsList(dtcs);
          this.vibrate([30]);
        } catch (err) {
          alert('Failed to read DTCs: ' + (err.message || err));
        } finally {
          scanBtn.disabled = false;
          scanBtn.textContent = 'Scan Diagnostic Codes';
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Cannot clear DTCs: Bluetooth OBD-II adapter is not connected. Please connect your adapter first.');
          return;
        }

        if (confirm('Clear all stored and pending DTCs across ECUs? This will reset emission readiness monitors.')) {
          clearBtn.disabled = true;
          clearBtn.textContent = 'Clearing...';

          try {
            await this.udsClient.clearDTCs();
            this.renderDtcsList([]);
            alert('Diagnostic Trouble Codes cleared successfully.');
            this.vibrate([50, 50]);
          } catch (err) {
            alert('Failed to clear DTCs: ' + (err.message || err));
          } finally {
            clearBtn.disabled = false;
            clearBtn.textContent = 'Clear All DTCs (Service 0x14)';
          }
        }
      });
    }
  }

  renderDtcsList(dtcs) {
    const container = document.getElementById('dtc-list-container');
    if (!container) return;

    if (dtcs.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:2rem;">
          <span style="font-size:2rem;">✅</span>
          <h4 style="margin-top:0.5rem; font-weight:700;">No Fault Codes Detected</h4>
          <p class="text-muted" style="font-size:0.85rem; margin-top:4px;">All monitored systems operating within nominal tolerances.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    dtcs.forEach(dtc => {
      const item = document.createElement('div');
      item.className = 'feature-item';
      item.style.borderLeft = '4px solid var(--danger)';
      item.innerHTML = `
        <div class="feature-info">
          <h4 style="color:var(--danger); font-family:var(--font-mono);">${dtc.code}</h4>
          <p style="color:var(--text-main); font-weight:600; margin-top:2px;">${dtc.description || 'Generic Powertrain Fault'}</p>
          <span style="font-size:0.72rem; color:#64748b; font-family:var(--font-mono);">Status: 0x${dtc.statusHex || '00'} • Confirmed MIL</span>
        </div>
      `;
      container.appendChild(item);
    });
  }
}

// Instantiate and launch
window.addEventListener('DOMContentLoaded', () => {
  const app = new VibesApp();
  app.init();
  window.__VIBES_APP__ = app;
});
