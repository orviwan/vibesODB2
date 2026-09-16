// vibesODB2 Progressive Web Application Controller
import { BUNDLED_SCHEMAS, computeByteDiff, hexStringToBytes, bytesToHexString } from './schemas.js';
import { saveBackup, getBackups, getBackupById, deleteBackup, exportBackupsJson, importBackupsJson, saveCustomFeature, getCustomFeatures } from './storage.js';
import { WebBleTransport } from './ble.js';
import { UdsClient } from './uds.js';
import { SafetyPipeline, BLACKLISTED_MODULES } from './safety.js';
import { TelemetryEngine } from './telemetry.js';
import { MaintenanceManager } from './maintenance.js';

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
    '5E': { model: 'Octavia Mk3', platform: 'MQB' },
    'NE': { model: 'Octavia Mk3', platform: 'MQB' },
    'NX': { model: 'Octavia Mk4', platform: 'MQB-Evo' },
    '1Z': { model: 'Octavia Mk2', platform: 'PQ35' },
    'NH': { model: 'Rapid', platform: 'PQ25' },
    'NS': { model: 'Kodiaq', platform: 'MQB' },
    'KH': { model: 'Karoq', platform: 'MQB' },
    'NW': { model: 'Scala / Kamiq', platform: 'MQB-A0' },
    'AD': { model: 'Tiguan Mk2', platform: 'MQB' },
    'BW': { model: 'Tiguan Allspace', platform: 'MQB' },
    '5N': { model: 'Tiguan Mk1', platform: 'PQ35' },
    '8Y': { model: 'A3 / S3 Mk4', platform: 'MQB-Evo' },
    'KL': { model: 'Leon Mk4', platform: 'MQB-Evo' },
    'FP': { model: 'Cupra Formentor', platform: 'MQB-Evo' },
    'GB': { model: 'A1 Sportback Mk2', platform: 'MQB-A0' },
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
    this.vin = null;

    // Default 30-byte baseline coding (realistic MQB stock equipment baseline)
    this.baselineHex = '30A005004080000000010304000001000000000000000000000000000000';
    this.baselineBytes = hexStringToBytes(this.baselineHex);
    this.currentBytes = new Uint8Array(this.baselineBytes);
    this.hasCapturedBaseline = false;
    this.featureFilter = 'all'; // 'all' | 'active' | 'inactive'
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

    this.maintenanceManager = new MaintenanceManager({
      udsClient: this.udsClient,
      bleTransport: this.bleTransport,
      showToast: (msg) => this.showToast(msg),
      vibrate: (pattern) => this.vibrate(pattern)
    });

    this.graphHistory = [];
    this.wakeLock = null;
    this.pendingWrite = null;
    this.lastVibrateTime = 0;
  }

  async init() {
    this.initPwaServiceWorker();
    await this.loadCustomFeatures();
    this.setupTabs();
    this.setupBluetooth();
    this.setupWakeLock();
    this.setupGauges();
    this.setupTelemetryGraphControls();
    this.setupFeatureConfirmationModal();
    this.setupFeatureCoding();
    this.setupByteMatrix();
    this.setupSafetyModal();
    this.setupBackupsTab();
    this.setupDtcsTab();
    this.maintenanceManager.init();
    this.setupUnitToggle();

    // Initial state: Disconnected, waiting for BLE
    this.renderTelemetry(this.telemetryEngine.getInitialMetrics());
    this.updateConnectionStatus(false);
    await this.renderBackupsList();
  }

  async loadCustomFeatures() {
    try {
      const customList = await getCustomFeatures();
      if (Array.isArray(customList)) {
        customList.forEach(cf => {
          const key = cf.schemaKey || 'mqb_bcm_0x09';
          const targetSchema = BUNDLED_SCHEMAS[key];
          if (targetSchema && targetSchema.features) {
            const exists = targetSchema.features.some(f => f.id === cf.id || (f.byte === cf.byte && f.bit === cf.bit && f.name === cf.name));
            if (!exists) {
              targetSchema.features.push(cf);
            }
          }
        });
      }
    } catch (e) {
      console.warn('Error loading custom features from storage:', e);
    }
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
        } else if (targetTab === 'tab-coding') {
          this.renderFeatureList();
        } else if (targetTab === 'tab-matrix') {
          this.renderByteGrid();
          this.renderBitSwitches();
        }
      });
    });

    const cockpitDtcsBtn = document.getElementById('btn-cockpit-view-dtcs');
    if (cockpitDtcsBtn) {
      cockpitDtcsBtn.addEventListener('click', () => {
        const dtcTabBtn = document.querySelector('.tab-btn[data-tab="tab-dtcs"]');
        if (dtcTabBtn) dtcTabBtn.click();
      });
    }

    // Support direct tab / modal opening via URL hash (e.g. #tab-coding, #tab-service, #modal-safety)
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      if (hash.startsWith('modal-')) {
        const modal = document.getElementById(hash);
        if (modal) modal.classList.add('active');
      } else {
        const matchBtn = document.querySelector(`.tab-btn[data-tab="${hash}"]`);
        if (matchBtn) setTimeout(() => matchBtn.click(), 50);
      }
    }
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
    const closeHelpBtn = document.getElementById('btn-close-ble-help');
    if (closeHelpBtn) {
      closeHelpBtn.addEventListener('click', () => this.closeBleHelpModal());
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
          await this.handleBleConnect();
        }
      });
    }
  }

  updateNoticeBanner() {
    const noticeEl = document.getElementById('cockpit-ble-notice');
    if (!noticeEl) return;
    const support = WebBleTransport.getSupportInfo();

    if (!support.supported && support.isLinux) {
      noticeEl.innerHTML = `
        <span style="font-size: 1.4rem;">🐧</span>
        <div style="flex:1;">
          <h4 style="font-size: 0.95rem; font-weight: 700; color: #fbbf24;">Web Bluetooth Disabled by Default on Linux</h4>
          <p style="font-size: 0.82rem; color: #cbd5e1; margin-top: 2px;">
            Google Chrome on Linux requires enabling experimental platform features to communicate with BLE adapters.
          </p>
          <div style="margin-top: 8px;">
            <button id="btn-show-linux-help" type="button" class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.78rem;">
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

    noticeEl.innerHTML = `
      <span style="font-size: 1.4rem;">⚡</span>
      <div>
        <h4 style="font-size: 0.95rem; font-weight: 700; color: #fbbf24;">Bluetooth Disconnected</h4>
        <p style="font-size: 0.82rem; color: #cbd5e1; margin-top: 2px;">
          Tap <strong>Connect BLE</strong> above to pair with your OBD-II adapter and stream live powertrain telemetry.
        </p>
      </div>
    `;
  }

  async handleBleConnect() {
    const bleBtn = document.getElementById('btn-ble-connect');
    if (bleBtn) bleBtn.textContent = 'Connecting...';

    try {
      const result = await this.bleTransport.connect();

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
    }
  }

  async handlePostConnectSetup() {
    this.showToast("Connected to adapter! Reading vehicle identification & ECU specs...");

    try {
      // 1. Query VIN via OBD-II Mode 09 PID 02, with UDS DID 0xF190 fallback
      let vin = null;
      try {
        await this.bleTransport.setHeader('7DF');
        if (this.bleTransport.setFlowControl) {
          await this.bleTransport.setFlowControl(null);
        }
        const vinResp = await this.bleTransport.sendCommand('0902', 2500);
        vin = this._extractVinFromResponse(vinResp);
      } catch (ve) {
        console.warn('Mode 09 VIN query error:', ve);
      }

      if (!vin) {
        const checkModules = ['0x19', this.currentSchema.module_address || '0x09', '0x01'];
        for (const mod of checkModules) {
          try {
            await this.udsClient.setModuleAddress(mod);
            await this.udsClient.enterExtendedSession();
            const vinBytes = await this.udsClient.readDataById('F190');
            vin = this._extractVinFromBytes(vinBytes);
            if (vin) break;
          } catch (ue) {
            console.warn(`UDS VIN query error on ${mod}:`, ue);
          }
        }
      }

      if (vin) {
        this.vin = vin;
        console.log('Vehicle VIN detected:', vin);
        // Automatic platform switching (MQB for Golf 7 / 7.5: 5G, BA, AU, BQ, 8V, etc.)
        if (/5G|BA|AU|BQ|8V|5F|5E|NE|NX|3G|AD|BW|7L|KH|NS/i.test(vin)) {
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

      const fetchSpecsFromModule = async (moduleHex) => {
        try {
          await this.udsClient.setModuleAddress(moduleHex);
          await this.udsClient.enterExtendedSession();

          if (ecuPartNo === '--') {
            try {
              const pBytes = await this.udsClient.readDataById('F187');
              const pStr = bytesToAscii(pBytes);
              if (pStr && pStr.length >= 3) ecuPartNo = pStr;
            } catch (e) {}
          }

          if (ecuHwNo === '--') {
            try {
              const hBytes = await this.udsClient.readDataById('F191');
              const hStr = bytesToAscii(hBytes);
              if (hStr && hStr.length >= 3) ecuHwNo = hStr;
            } catch (e) {}
          }

          if (ecuSwVer === '--') {
            try {
              const sBytes = await this.udsClient.readDataById('F189');
              const sStr = bytesToAscii(sBytes);
              if (sStr && sStr.length >= 2) ecuSwVer = sStr;
            } catch (e) {}
          }

          if (ecuSerial === '--') {
            try {
              const snBytes = await this.udsClient.readDataById('F18C');
              const snStr = bytesToAscii(snBytes);
              if (snStr && snStr.length >= 4) {
                ecuSerial = snStr;
              } else if (snBytes && snBytes.length >= 4) {
                ecuSerial = bytesToHexString(snBytes);
              }
            } catch (e) {}
          }
        } catch (err) {
          console.warn(`ECU spec query error on ${moduleHex}:`, err);
        }
      };

      // Query target module (BCM 0x09 at 70E)
      await fetchSpecsFromModule(this.currentSchema.module_address || '0x09');

      // If any specs missing, fallback to Gateway (0x19 at 710) or Engine (0x01 at 7E0)
      if (ecuPartNo === '--' || ecuHwNo === '--' || ecuSwVer === '--') {
        await fetchSpecsFromModule('0x19');
      }
      if (ecuPartNo === '--' || ecuHwNo === '--' || ecuSwVer === '--') {
        await fetchSpecsFromModule('0x01');
      }

      // Update Vehicle Specs Card in Cockpit
      this.updateVehicleSpecsDisplay({
        vin: this.vin,
        ecuPartNo,
        ecuHwNo,
        ecuSwVer,
        ecuSerial
      });

      // 3. Read live Long Coding from target module (BCM 0x09)
      try {
        await this.readLiveCodingFromVehicle(true);
      } catch (ce) {
        console.warn('Post-connect live coding read fallback:', ce);
      }

      // 4. Automatic Background Diagnostic Trouble Code (DTC) Scan
      try {
        const dtcs = await this.udsClient.readDTCs();
        this.updateCockpitDtcAlert(dtcs);
        this.renderDtcsList(dtcs);
      } catch (dtcErr) {
        console.warn('Auto DTC check error:', dtcErr);
      }
    } catch (err) {
      console.warn('Post-connect setup fallback:', err);
      try {
        const backup = await saveBackup({
          vin: this.vin || 'UNKNOWN_VIN',
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

  updateCockpitDtcAlert(dtcs) {
    const alertCard = document.getElementById('cockpit-dtc-alert');
    const titleEl = document.getElementById('cockpit-dtc-title');
    const descEl = document.getElementById('cockpit-dtc-desc');
    if (!alertCard) return;

    const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);
    if (isConnected && Array.isArray(dtcs) && dtcs.length > 0) {
      alertCard.style.display = 'block';
      if (titleEl) {
        titleEl.textContent = `⚠️ ${dtcs.length} Diagnostic Trouble Code${dtcs.length > 1 ? 's' : ''} Detected`;
      }
      if (descEl) {
        const codeList = dtcs.map(d => d.code).join(', ');
        descEl.textContent = `Active fault codes found in vehicle memory: ${codeList}. Tap below to view code diagnostics and clear.`;
      }
    } else {
      alertCard.style.display = 'none';
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
    if (!rawBytes || rawBytes.length === 0) return null;
    let bytes = rawBytes;
    if (bytes.length >= 20 && bytes[0] === 0x62 && bytes[1] === 0xF1 && bytes[2] === 0x90) {
      bytes = bytes.subarray(3);
    }
    const str = bytesToAscii(bytes);
    const match = str.match(/[A-HJ-NPR-Z0-9]{17}/i);
    return match ? match[0].toUpperCase() : null;
  }

  _extractVinFromResponse(resp) {
    if (!resp) return null;
    const clean = resp.replace(/>/g, ' ').toUpperCase();

    // 1. Check for UDS DID 0xF190 response: "62 F1 90 ..." or "62F190..."
    const udsMatch = clean.match(/62\s*F1\s*90\s*([0-9A-F\s]{34,})/i);
    if (udsMatch) {
      const hexBytes = udsMatch[1].replace(/[^0-9A-F]/gi, '');
      let ascii = '';
      for (let i = 0; i + 1 < hexBytes.length && ascii.length < 17; i += 2) {
        const code = parseInt(hexBytes.substr(i, 2), 16);
        if (code >= 32 && code <= 126) ascii += String.fromCharCode(code);
      }
      const vinMatch = ascii.match(/[A-HJ-NPR-Z0-9]{17}/i);
      if (vinMatch) return vinMatch[0].toUpperCase();
    }

    // 2. Parse OBD-II Mode 09 PID 02 multi-line / ISO-TP framed responses
    const lines = clean.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    let mode09Payload = '';
    let foundMode09 = false;

    for (const line of lines) {
      const noPrefix = line.replace(/^[0-9A-F]+:\s*/i, '').trim();
      const tokens = noPrefix.split(/\s+/).filter(t => /^[0-9A-F]{2}$/i.test(t));
      if (tokens.length === 0) continue;

      if (tokens[0] === '49' && tokens[1] === '02' && tokens.length >= 3) {
        foundMode09 = true;
        for (let k = 3; k < tokens.length; k++) {
          mode09Payload += tokens[k];
        }
      } else if (foundMode09) {
        for (const tok of tokens) {
          mode09Payload += tok;
        }
      }
    }

    if (mode09Payload.length >= 34) {
      let ascii = '';
      for (let i = 0; i + 1 < mode09Payload.length; i += 2) {
        const code = parseInt(mode09Payload.substr(i, 2), 16);
        if (code >= 32 && code <= 126) ascii += String.fromCharCode(code);
      }
      const match = ascii.match(/[A-HJ-NPR-Z0-9]{17}/i);
      if (match) return match[0].toUpperCase();
    }

    // 3. Parse continuous stream with inline 49 02 XX markers
    const allTokens = clean.split(/\s+/).filter(t => /^[0-9A-F]{2}$/i.test(t));
    let streamPayload = '';
    let i = 0;
    while (i < allTokens.length) {
      if (allTokens[i] === '49' && allTokens[i + 1] === '02' && i + 2 < allTokens.length) {
        i += 3;
        while (i < allTokens.length && !(allTokens[i] === '49' && allTokens[i + 1] === '02')) {
          streamPayload += allTokens[i];
          i++;
        }
      } else {
        i++;
      }
    }

    if (streamPayload.length >= 34) {
      let ascii = '';
      for (let j = 0; j + 1 < streamPayload.length; j += 2) {
        const code = parseInt(streamPayload.substr(j, 2), 16);
        if (code >= 32 && code <= 126) ascii += String.fromCharCode(code);
      }
      const match = ascii.match(/[A-HJ-NPR-Z0-9]{17}/i);
      if (match) return match[0].toUpperCase();
    }

    // 4. Ultimate fallback: scan all printable hex pairs
    let generalAscii = '';
    for (const tok of allTokens) {
      const code = parseInt(tok, 16);
      if (code >= 32 && code <= 126) {
        generalAscii += String.fromCharCode(code);
      } else {
        generalAscii += ' ';
      }
    }
    const generalMatch = generalAscii.match(/[A-HJ-NPR-Z0-9]{17}/i);
    if (generalMatch) return generalMatch[0].toUpperCase();

    return null;
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
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    const cockpitNotice = document.getElementById('cockpit-ble-notice');
    const codingNotice = document.getElementById('coding-ble-notice');
    const matrixNotice = document.getElementById('matrix-ble-notice');
    const serviceNotice = document.getElementById('service-ble-notice');
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
      if (statusDot) {
        statusDot.className = 'dot connected';
      }
      if (statusText) {
        statusText.textContent = this.bleTransport.device?.name || 'BLE Connected';
      }
      if (cockpitNotice) cockpitNotice.style.display = 'none';
      if (codingNotice) codingNotice.style.display = 'none';
      if (matrixNotice) matrixNotice.style.display = 'none';
      if (serviceNotice) serviceNotice.style.display = 'none';
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
      if (serviceNotice) serviceNotice.style.display = 'block';
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

    // 9. Throttle / Accelerator Pedal Position
    const throttleEl = document.getElementById('metric-throttle-val');
    if (throttleEl) {
      throttleEl.textContent = data.throttle_position_pct != null 
        ? `${Math.round(data.throttle_position_pct)}%` 
        : '-- %';
    }

    // 10. Engine Calculated Load
    const loadEl = document.getElementById('metric-load-val');
    if (loadEl) {
      loadEl.textContent = data.engine_load_pct != null 
        ? `${Math.round(data.engine_load_pct)}%` 
        : '-- %';
    }

    // 11. Engine Oil Temp
    const oilEl = document.getElementById('metric-oil-val');
    if (oilEl) {
      oilEl.textContent = data.oil_temp_c != null 
        ? `${Math.round(data.oil_temp_c)} °C` 
        : '-- °C';
    }

    // 12. Battery Voltage
    const voltEl = document.getElementById('metric-voltage-val');
    if (voltEl) {
      voltEl.textContent = data.battery_voltage != null 
        ? `${data.battery_voltage.toFixed(1)} V` 
        : '-- V';
    }

    // 13. Draw Real-Time Telemetry Graph
    this.drawTelemetryChart(data);
  }

  renderHz(rateData) {
    const hzEl = document.getElementById('telemetry-hz');
    if (hzEl) {
      const hzVal = (rateData && typeof rateData === 'object') ? rateData.hz : rateData;
      hzEl.textContent = `${Number(hzVal || 0).toFixed(1)} Hz`;
    }
    const sampleEl = document.getElementById('telemetry-sample-count');
    if (sampleEl && rateData && typeof rateData === 'object' && rateData.recordedCount !== undefined) {
      sampleEl.textContent = `${rateData.recordedCount.toLocaleString()} samples`;
    }
  }

  // --- Telemetry Scope & CSV Recording Controls ---
  setupTelemetryGraphControls() {
    const btnRecord = document.getElementById('btn-record-telemetry');
    const btnClear = document.getElementById('btn-clear-telemetry');
    const btnExport = document.getElementById('btn-export-telemetry-csv');
    const badge = document.getElementById('telemetry-record-badge');
    const countEl = document.getElementById('telemetry-sample-count');

    if (btnRecord) {
      btnRecord.addEventListener('click', () => {
        if (this.telemetryEngine.isRecording) {
          this.telemetryEngine.stopRecording();
          btnRecord.textContent = '⏺️ Start Recording';
          btnRecord.className = 'btn btn-primary';
          if (badge) {
            badge.textContent = 'Paused';
            badge.style.background = 'rgba(245, 158, 11, 0.2)';
            badge.style.color = '#f59e0b';
          }
          this.showToast('⏸️ Telemetry recording paused.');
        } else {
          this.telemetryEngine.startRecording();
          btnRecord.textContent = '⏸️ Pause Recording';
          btnRecord.className = 'btn btn-danger';
          if (badge) {
            badge.textContent = '🔴 Recording';
            badge.style.background = 'rgba(239, 68, 68, 0.2)';
            badge.style.color = '#f87171';
          }
          this.showToast('⏺️ Recording live telemetry session...');
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        this.telemetryEngine.clearRecording();
        this.graphHistory = [];
        this.drawTelemetryChart({});
        if (countEl) countEl.textContent = '0 samples';
        if (badge && !this.telemetryEngine.isRecording) {
          badge.textContent = 'Idle';
          badge.style.background = 'rgba(100, 116, 139, 0.2)';
          badge.style.color = '#94a3b8';
        }
        this.showToast('Recording buffer cleared.');
      });
    }

    if (btnExport) {
      btnExport.addEventListener('click', () => {
        const csv = this.telemetryEngine.exportCsv();
        if (!csv) {
          alert('No recorded telemetry data to export. Tap "Start Recording" to capture data while driving.');
          return;
        }

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safeDate = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `vibesodb2_telemetry_${this.vin || 'session'}_${safeDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('📥 Telemetry CSV log downloaded!');
      });
    }
  }

  drawTelemetryChart(latestData) {
    const canvas = document.getElementById('telemetry-chart-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Push latest point into circular graph history (keep last 120 points)
    if (latestData && (latestData.engine_rpm != null || latestData.vehicle_speed_kmh != null)) {
      this.graphHistory.push({
        rpm: latestData.engine_rpm || 0,
        speed: latestData.vehicle_speed_kmh || 0,
        boost: latestData.boost_pressure_bar || 0,
        throttle: latestData.throttle_position_pct || 0,
        coolant: latestData.coolant_temp_c || 0,
        egt: latestData.exhaust_gas_temp_c || latestData.egt_c || 0
      });
      if (this.graphHistory.length > 120) {
        this.graphHistory.shift();
      }
    }

    const w = canvas.width;
    const h = canvas.height;

    // Clear background
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, w, h);

    // Draw horizontal grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let y = 0; y <= 4; y++) {
      const yPos = (h / 4) * y;
      ctx.beginPath();
      ctx.moveTo(0, yPos);
      ctx.lineTo(w, yPos);
      ctx.stroke();
    }

    if (this.graphHistory.length < 2) return;

    const dx = w / (Math.max(120, this.graphHistory.length) - 1);

    const drawSeries = (color, getValueFn, maxScale) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < this.graphHistory.length; i++) {
        const val = getValueFn(this.graphHistory[i]);
        const norm = Math.min(1.0, Math.max(0.0, val / maxScale));
        const px = i * dx;
        const py = h - (norm * (h - 20) + 10);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    // Plot series
    drawSeries('#38bdf8', pt => pt.rpm, 6000);        // RPM (0-6000)
    drawSeries('#10b981', pt => pt.speed, 200);       // Speed (0-200 km/h)
    drawSeries('#f59e0b', pt => pt.boost, 2.0);       // Boost (0-2.0 bar)
    drawSeries('#ec4899', pt => pt.throttle, 100);    // Throttle (0-100%)
    drawSeries('#ef4444', pt => pt.coolant, 130);     // Coolant (0-130°C)
    drawSeries('#a855f7', pt => pt.egt, 900);         // EGT (0-900°C)
  }

  async readLiveCodingFromVehicle(isAutoBaseline = false) {
    if (!this.bleTransport || !this.bleTransport.isConnected) {
      if (!isAutoBaseline) {
        alert('Please connect your Bluetooth OBD-II adapter first.');
      }
      return false;
    }

    const targetMod = this.currentSchema.module_address || '0x09';
    if (!isAutoBaseline) {
      this.showToast(`Reading live Long Coding from module ${targetMod}...`);
    }

    try {
      await this.udsClient.setModuleAddress(targetMod);
      await this.udsClient.enterExtendedSession();

      const primaryDid = (this.currentSchema.coding_did || '0600').replace(/^0x/i, '');
      const candidateDids = [primaryDid, '0600', 'F1A0', '0100'].filter((d, i, a) => a.indexOf(d) === i);
      let liveCoding = null;

      for (const cDid of candidateDids) {
        try {
          const resBytes = await this.udsClient.readDataById(cDid);
          if (resBytes && resBytes.length >= 10) {
            liveCoding = resBytes;
            console.log(`Successfully read Long Coding via DID 0x${cDid} (${resBytes.length} bytes)`);
            break;
          }
        } catch (de) {
          console.warn(`DID 0x${cDid} read error:`, de);
        }
      }

      if (liveCoding && liveCoding.length >= 10) {
        this.baselineBytes = new Uint8Array(liveCoding);
        this.currentBytes = new Uint8Array(liveCoding);
        this.baselineHex = bytesToHexString(this.baselineBytes);

        // Auto-save fresh snapshot
        const backup = await saveBackup({
          vin: this.vin || 'UNKNOWN_VIN',
          moduleAddress: targetMod,
          did: this.currentSchema.coding_did || '0x0600',
          featureName: isAutoBaseline ? 'Initial Connect Baseline Snapshot (Auto-Protected)' : `Live Vehicle Coding Read (${targetMod})`,
          rawHexData: this.baselineHex,
          timestamp: new Date().toISOString()
        });

        this.hasCapturedBaseline = true;
        this.renderBackupsList();
        this.renderByteGrid();
        this.renderBitSwitches();
        this.renderFeatureList();

        const msg = isAutoBaseline 
          ? `🛡️ Baseline Snapshot #${backup.id} captured (${liveCoding.length} bytes)! Features synchronized with vehicle.`
          : `✅ Vehicle Long Coding successfully read (${liveCoding.length} bytes)! Features updated.`;
        this.showToast(msg);
        return true;
      } else {
        if (!isAutoBaseline) {
          alert('Could not read Long Coding from module. Ensure ignition is ON with engine OFF.');
        }
        return false;
      }
    } catch (err) {
      console.error('Failed to read live coding:', err);
      if (!isAutoBaseline) {
        alert('Failed to read live coding: ' + (err.message || err));
      }
      return false;
    }
  }

  // --- Feature Coding Tab ---
  setupFeatureCoding() {
    const readLiveCodingBtn = document.getElementById('btn-read-live-coding');
    if (readLiveCodingBtn) {
      readLiveCodingBtn.addEventListener('click', async () => {
        readLiveCodingBtn.disabled = true;
        const orig = readLiveCodingBtn.textContent;
        readLiveCodingBtn.textContent = 'Reading ECU...';
        try {
          await this.readLiveCodingFromVehicle(false);
        } finally {
          readLiveCodingBtn.disabled = false;
          readLiveCodingBtn.textContent = orig;
        }
      });
    }

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

    // Add Custom Feature Modal Controls
    const openAddBtn = document.getElementById('btn-open-add-custom');
    const cancelAddBtn = document.getElementById('btn-cancel-custom-feat');
    const addModal = document.getElementById('modal-add-custom-feature');
    const addForm = document.getElementById('form-add-custom-feature');

    if (openAddBtn && addModal) {
      openAddBtn.addEventListener('click', () => {
        addModal.classList.add('active');
        const nameInput = document.getElementById('custom-feat-name');
        if (nameInput) setTimeout(() => nameInput.focus(), 100);
      });
    }

    if (cancelAddBtn && addModal) {
      cancelAddBtn.addEventListener('click', () => {
        addModal.classList.remove('active');
      });
    }

    if (addForm && addModal) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('custom-feat-name').value.trim();
        const byte = parseInt(document.getElementById('custom-feat-byte').value, 10);
        const bit = parseInt(document.getElementById('custom-feat-bit').value, 10);
        const category = document.getElementById('custom-feat-category').value.trim() || 'Custom Settings';
        const description = document.getElementById('custom-feat-desc').value.trim();

        if (!name || isNaN(byte) || isNaN(bit) || byte < 0 || byte > 29 || bit < 0 || bit > 7) {
          alert('Please enter a valid feature name, byte index (0–29), and bit index (0–7).');
          return;
        }

        const newFeat = {
          id: `custom_${Date.now()}`,
          name,
          byte,
          bit,
          category,
          description,
          schemaKey: this.selectedSchemaKey,
          platform: this.currentSchema?.platform || 'VAG',
          module_address: this.currentSchema?.module_address || '0x09',
          isCustom: true
        };

        await saveCustomFeature(newFeat);
        if (this.currentSchema && this.currentSchema.features) {
          this.currentSchema.features.push(newFeat);
        }

        this.renderFeatureList();
        this.renderByteGrid();
        this.renderBitSwitches();
        this.showToast(`✓ Custom setting "${name}" (Byte ${byte}, Bit ${bit}) saved!`);
        addModal.classList.remove('active');
        addForm.reset();
      });
    }

    // Filter buttons click handler
    document.querySelectorAll('.btn-filter-feat').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-filter-feat').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'rgba(100, 116, 139, 0.2)';
          b.style.color = '#cbd5e1';
          b.style.borderColor = 'var(--border-color)';
        });
        btn.classList.add('active');
        btn.style.background = 'var(--primary)';
        btn.style.color = '#fff';
        btn.style.borderColor = 'var(--primary)';
        this.featureFilter = btn.getAttribute('data-filter') || 'all';
        this.renderFeatureList();
      });
    });

    // Export Community Schema JSON
    const exportSchemaBtn = document.getElementById('btn-export-community-schema');
    if (exportSchemaBtn) {
      exportSchemaBtn.addEventListener('click', () => {
        const schemaData = JSON.stringify(this.currentSchema, null, 2);
        const blob = new Blob([schemaData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safePlatform = (this.currentSchema.platform || 'vag').toLowerCase();
        a.href = url;
        a.download = `vibesodb2_${safePlatform}_${this.selectedSchemaKey}_schema.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast(`Exported schema JSON for ${this.currentSchema.platform || 'VAG'} (${this.currentSchema.features?.length || 0} features)`);
      });
    }

    this.renderFeatureList();
  }

  renderFeatureList() {
    const container = document.getElementById('feature-list-container');
    if (!container) return;
    container.innerHTML = '';

    const allFeatures = this.currentSchema.features || [];
    const countAllEl = document.getElementById('count-feat-all');
    const countActiveEl = document.getElementById('count-feat-active');
    const countInactiveEl = document.getElementById('count-feat-inactive');
    const bytesLenEl = document.getElementById('val-coding-bytes-len');

    let activeCount = 0;
    let inactiveCount = 0;

    allFeatures.forEach(feat => {
      const isEnabled = (this.currentBytes[feat.byte] & (1 << feat.bit)) !== 0;
      if (isEnabled) activeCount++;
      else inactiveCount++;
    });

    if (countAllEl) countAllEl.textContent = allFeatures.length;
    if (countActiveEl) countActiveEl.textContent = activeCount;
    if (countInactiveEl) countInactiveEl.textContent = inactiveCount;
    if (bytesLenEl) bytesLenEl.textContent = this.currentBytes.length;

    let displayFeatures = allFeatures;
    if (this.featureFilter === 'active') {
      displayFeatures = allFeatures.filter(f => (this.currentBytes[f.byte] & (1 << f.bit)) !== 0);
    } else if (this.featureFilter === 'inactive') {
      displayFeatures = allFeatures.filter(f => (this.currentBytes[f.byte] & (1 << f.bit)) === 0);
    }

    if (displayFeatures.length === 0) {
      container.innerHTML = `<p class="text-muted" style="padding: 1.5rem; text-align: center; background: rgba(15, 23, 42, 0.4); border-radius: 8px; border: 1px solid var(--border-color);">No features match the filter "${this.featureFilter}". Use "All Settings" or switch target module.</p>`;
      return;
    }

    // Group features by Category
    const grouped = {};
    displayFeatures.forEach(feat => {
      const cat = feat.category || 'General Vehicle Coding';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(feat);
    });

    const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);

    Object.keys(grouped).forEach(category => {
      const catHeader = document.createElement('div');
      catHeader.style.cssText = 'margin: 1.25rem 0 0.5rem 0; font-size: 0.82rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(100, 116, 139, 0.2); padding-bottom: 4px;';
      catHeader.innerHTML = `<span>📁 ${category}</span> <span style="font-size: 0.72rem; padding: 1px 6px; border-radius: 4px; background: rgba(100, 116, 139, 0.2); color: #cbd5e1;">${grouped[category].length} setting${grouped[category].length > 1 ? 's' : ''}</span>`;
      container.appendChild(catHeader);

      grouped[category].forEach(feat => {
        const isEnabled = (this.currentBytes[feat.byte] & (1 << feat.bit)) !== 0;
        const wasOriginalEnabled = (this.baselineBytes[feat.byte] & (1 << feat.bit)) !== 0;
        const isModified = (isEnabled !== wasOriginalEnabled);

        const item = document.createElement('div');
        item.className = `feature-item ${isModified ? 'feature-item-modified' : ''}`;
        if (isModified) {
          item.style.borderLeft = '3px solid var(--warning)';
          item.style.background = 'rgba(245, 158, 11, 0.05)';
        } else if (isEnabled) {
          item.style.borderLeft = '3px solid #10b981';
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
        } else if (isEnabled) {
          stateBadgeHtml = `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:0.7rem; padding:1px 6px; border-radius:4px; background:rgba(16, 185, 129, 0.15); color:#34d399; font-weight:700; border:1px solid rgba(16, 185, 129, 0.3); margin-left:6px;">
              🟢 Active / ON
            </span>
          `;
        } else {
          stateBadgeHtml = `
            <span style="display:inline-flex; align-items:center; font-size:0.7rem; padding:1px 5px; border-radius:3px; background:rgba(100, 116, 139, 0.2); color:#94a3b8; margin-left:6px;">
              ⚪ Disabled / OFF
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
              const modifiedBytes = new Uint8Array(this.currentBytes);
              if (targetState) {
                modifiedBytes[feat.byte] |= (1 << feat.bit);
              } else {
                modifiedBytes[feat.byte] &= ~(1 << feat.bit);
              }

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
                  checkbox.checked = !targetState;
                }
              });
            },
            onCancel: () => {
              checkbox.checked = !targetState;
            }
          });
        });

        toggleLabel.appendChild(checkbox);
        toggleLabel.appendChild(slider);

        item.appendChild(info);
        item.appendChild(toggleLabel);
        container.appendChild(item);
      });
    });
  }

  // --- Interactive Byte Matrix Tab ---
  setupByteMatrix() {
    const rawInput = document.getElementById('raw-hex-input');
    const applyBtn = document.getElementById('btn-apply-hex');
    const resetBtn = document.getElementById('btn-reset-hex');
    const matrixReadBtn = document.getElementById('btn-matrix-read-coding');

    if (matrixReadBtn) {
      matrixReadBtn.addEventListener('click', async () => {
        matrixReadBtn.disabled = true;
        const orig = matrixReadBtn.textContent;
        matrixReadBtn.textContent = 'Reading...';
        try {
          await this.readLiveCodingFromVehicle(false);
        } finally {
          matrixReadBtn.disabled = false;
          matrixReadBtn.textContent = orig;
        }
      });
    }

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
      item.className = 'backup-card';

      const dateStr = new Date(b.timestamp).toLocaleString();
      const rawHex = b.raw_hex_data || b.baselineHex || '';
      const modAddr = b.module_address || b.targetModule || '0x09';
      const backupBytes = hexStringToBytes(rawHex);
      const diffs = computeByteDiff(this.currentBytes, backupBytes);

      let diffBadgeHtml = '';
      if (diffs.length === 0) {
        diffBadgeHtml = `<span style="font-size:0.72rem; padding:2px 7px; border-radius:4px; background:rgba(16,185,129,0.15); color:#34d399; font-weight:600; border:1px solid rgba(16,185,129,0.3);">✓ Matches Active Buffer</span>`;
      } else {
        diffBadgeHtml = `<span style="font-size:0.72rem; padding:2px 7px; border-radius:4px; background:rgba(245,158,11,0.2); color:#fbbf24; font-weight:700; border:1px solid rgba(245,158,11,0.4);">⚠️ ${diffs.length} Byte${diffs.length > 1 ? 's' : ''} Differs from Active</span>`;
      }

      let diffRowsHtml = '';
      if (diffs.length > 0) {
        diffRowsHtml = `
          <table class="diff-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Active Buffer</th>
                <th>Snapshot Backup</th>
                <th>Bit Alterations</th>
              </tr>
            </thead>
            <tbody>
              ${diffs.map(d => {
                const bitNotes = d.bitFlips.map(f => `Bit ${f.bit}: ${f.oldVal ? '1' : '0'} ➔ ${f.newVal ? '1' : '0'}`).join(', ');
                return `
                  <tr>
                    <td style="font-weight:700; color:var(--primary-light);">Byte ${d.byteIndex}</td>
                    <td style="font-family:var(--font-mono); color:#94a3b8;">0x${d.oldHex}</td>
                    <td style="font-family:var(--font-mono); color:#38bdf8; font-weight:700;">0x${d.newHex}</td>
                    <td style="color:#fbbf24;">${bitNotes}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      } else {
        diffRowsHtml = `<p style="font-size:0.8rem; color:#94a3b8; margin:0.35rem 0;">No byte differences detected between this snapshot and your active buffer.</p>`;
      }

      item.innerHTML = `
        <div class="backup-header">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
              <h4 style="font-size:0.95rem; font-weight:700; margin:0;">${b.featureName || 'ECU Coding Snapshot'}</h4>
              ${diffBadgeHtml}
            </div>
            <div style="font-size:0.75rem; color:#64748b;">
              VIN: <span style="font-family:var(--font-mono); color:#94a3b8;">${b.vin || this.vin}</span> • Module ${modAddr} • DID ${b.did || '0x0600'} • ${dateStr}
            </div>
          </div>
          <div class="backup-actions">
            <button class="btn btn-secondary" style="font-size:0.75rem; padding:4px 8px;" id="btn-diff-${b.id}">🔍 Diff Explorer</button>
            <button class="btn btn-secondary" style="font-size:0.75rem; padding:4px 8px;" id="btn-download-${b.id}" title="Download JSON file for this backup">💾 Download</button>
            <button class="btn btn-primary" style="font-size:0.75rem; padding:4px 8px;" id="btn-restore-${b.id}" ${!isConnected ? 'disabled title="Connect Bluetooth to restore snapshot"' : ''}>↺ Restore</button>
            <button class="btn btn-danger" style="font-size:0.75rem; padding:4px 8px;" id="btn-delete-${b.id}" title="Delete this snapshot">🗑️</button>
          </div>
        </div>
        
        <div style="font-family:var(--font-mono); font-size:0.73rem; color:#94a3b8; word-break:break-all; background:#070a12; padding:6px 10px; border-radius:6px; margin-bottom:0.5rem;">
          ${rawHex}
        </div>

        <div class="backup-diff-container" id="diff-panel-${b.id}">
          <div style="font-size:0.8rem; font-weight:700; color:#e2e8f0; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
            <span>Differential Comparison: Active vs Snapshot</span>
            <span style="font-size:0.72rem; color:#64748b;">Snapshot #${b.id}</span>
          </div>
          ${diffRowsHtml}
        </div>
      `;

      container.appendChild(item);

      // Diff Toggle
      const diffBtn = item.querySelector(`#btn-diff-${b.id}`);
      const diffPanel = item.querySelector(`#diff-panel-${b.id}`);
      if (diffBtn && diffPanel) {
        diffBtn.addEventListener('click', () => {
          diffPanel.classList.toggle('active');
          diffBtn.classList.toggle('active');
        });
      }

      // Download Single Backup
      const downloadBtn = item.querySelector(`#btn-download-${b.id}`);
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
          const jsonStr = JSON.stringify(b, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const safeDate = (b.timestamp || new Date().toISOString()).replace(/[:.]/g, '-');
          a.href = url;
          a.download = `vibesodb2_snapshot_${b.vin || 'vehicle'}_${safeDate}.json`;
          a.click();
          URL.revokeObjectURL(url);
        });
      }

      // Restore
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
              this.renderBackupsList();
              this.vibrate([40, 20, 40]);
            },
            onCancel: () => {}
          });
        });
      }

      // Delete
      const deleteBtn = item.querySelector(`#btn-delete-${b.id}`);
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (confirm(`Are you sure you want to permanently delete snapshot #${b.id} (${b.featureName || dateStr})?`)) {
            await deleteBackup(b.id);
            this.showToast(`Snapshot #${b.id} deleted.`);
            this.renderBackupsList();
          }
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
          this.updateCockpitDtcAlert(dtcs);
          this.vibrate([30]);
        } catch (err) {
          alert('Failed to read DTCs: ' + (err.message || err));
        } finally {
          scanBtn.disabled = false;
          scanBtn.textContent = 'Scan Fault Codes';
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
            this.updateCockpitDtcAlert([]);
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
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const app = new VibesApp();
    app.init();
    window.__VIBES_APP__ = app;
  });
}
