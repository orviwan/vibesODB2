// vibesODB2 Progressive Web Application Controller
import { BUNDLED_SCHEMAS, computeByteDiff, hexStringToBytes, bytesToHexString } from './schemas.js';
import { saveBackup, getBackups, getBackupById, deleteBackup, exportBackupsJson, importBackupsJson, saveCustomFeature, getCustomFeatures } from './storage.js';
import { WebBleTransport } from './ble.js';
import { UdsClient } from './uds.js';
import { SafetyPipeline, BLACKLISTED_MODULES } from './safety.js';
import { TelemetryEngine } from './telemetry.js';
import { MaintenanceManager } from './maintenance.js';
import { lookupDtc } from './dtc_db.js';
import { SimulatedBleTransport, SIM_PROFILES } from './simulator.js';

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
    try {
      this.vin = localStorage.getItem('vibesodb2_last_vehicle_id') || null;
    } catch (_) {
      this.vin = null;
    }

    // Default 30-byte baseline coding (realistic MQB stock equipment baseline)
    this.baselineHex = '30A005004080000000010304000001000000000000000000000000000000';
    this.baselineBytes = hexStringToBytes(this.baselineHex);
    this.currentBytes = new Uint8Array(this.baselineBytes);
    this.hasCapturedBaseline = false;
    this.detectedPlatform = null;
    this.detectedModel = null;
    this.featureFilter = 'all'; // 'all' | 'active' | 'inactive' | 'unsupported'
    this._pendingFeatConfirm = null;
    this._toastTimeout = null;
    this.lastDtcScanResults = null;
    this.dtcFilterText = '';

    // Ignition State & Voltage Monitor
    this.ignitionState = 'unknown'; // 'on' | 'off' | 'running' | 'unknown' | 'disconnected'
    this.batteryVoltage = null;
    this._ignitionPollTimer = null;
    this.isBusBusy = false;

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
    this.activeTab = 'tab-cockpit';
    this.isSimulated = false;
    this.simProfileId = 'transporter_t51';
  }

  async init() {
    this.initPwaServiceWorker();
    await this.loadCustomFeatures();
    this.setupTabs();
    this.setupBluetooth();
    this.setupSimulator();
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
    this.setupFuelEconomy();
    this.setupEditRegModal();
    this.setupIgnitionHandlers();

    // Initial state: Disconnected, waiting for BLE
    this.renderTelemetry(this.telemetryEngine.getInitialMetrics());
    this.updateConnectionStatus(false);
    this.updateVehicleRegUI();
    await this.renderBackupsList();

    // Auto-detect URL parameter for simulator mode (?sim=1 or ?simulator=1)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('sim') || urlParams.has('simulator') || urlParams.has('mock')) {
      const profile = urlParams.get('profile') || 'transporter_t51';
      const engine = urlParams.get('engine') !== 'off';
      setTimeout(() => {
        this.startSimulation(profile, engine);
      }, 300);
    }
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

  // --- Ignition-Gated Write Permission ---
  // Returns true only when BLE is connected AND the vehicle ignition is ON (key pos 2).
  // Coding writes to ECU EEPROM are UNSAFE when:
  //   - ignition is OFF (ECU powered down or sleeping, EEPROM writes will fail or corrupt)
  //   - engine is running (ECU may be in diagnostic lockout, unstable operating conditions)
  //   - ignition state is unknown (no bus ping response yet — treat as unsafe)
  get isWritable() {
    const connected = !!(this.bleTransport && this.bleTransport.isConnected);
    return connected && this.ignitionState === 'on';
  }

  get isWriteBlockedReason() {
    if (!this.bleTransport || !this.bleTransport.isConnected) {
      return 'Connect your OBD-II adapter via Bluetooth first.';
    }
    if (this.ignitionState === 'off') {
      return 'Vehicle ignition is OFF. Turn the key to Position 2 (Ignition ON, engine not running) before making any changes.';
    }
    if (this.ignitionState === 'running') {
      return 'Engine is running. Switch the engine OFF (ignition ON only) before writing ECU coding.';
    }
    if (this.ignitionState === 'unknown') {
      return 'Ignition state is unknown. Wait for the adapter to detect the vehicle bus, or press "Check Ignition".';
    }
    return 'Cannot write: vehicle bus is not responding.';
  }

  // --- Service Worker Registration ---
  initPwaServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('vibesODB2 SW registered with scope:', reg.scope);
            // Proactively check for an updated service worker script
            reg.update().catch(() => {});
          })
          .catch(err => console.warn('vibesODB2 SW registration error:', err));
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing && (!this.bleTransport || !this.bleTransport.isConnected)) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }

  // --- Tabs Navigation & URL History Management ---
  switchTab(targetTab, updateHistory = true) {
    if (!targetTab) targetTab = 'tab-cockpit';
    const targetContent = document.getElementById(targetTab);
    const targetBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);

    if (!targetContent || !targetBtn) {
      targetTab = 'tab-cockpit';
    }

    this.activeTab = targetTab;

    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const activeBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
    const activeContent = document.getElementById(targetTab);

    if (activeBtn) activeBtn.classList.add('active');
    if (activeContent) activeContent.classList.add('active');

    // Close open modals when switching tabs
    this.closeAllModals(true);

    if (targetTab === 'tab-backups') {
      this.renderBackupsList();
    } else if (targetTab === 'tab-coding') {
      this.renderFeatureList();
    } else if (targetTab === 'tab-matrix') {
      this.renderByteGrid();
      this.renderBitSwitches();
    }

    if (updateHistory) {
      const currentHash = window.location.hash.replace('#', '');
      if (currentHash !== targetTab) {
        history.pushState({ tab: targetTab }, '', '#' + targetTab);
      }
    }
  }

  openModal(modalId, updateHistory = true) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');

    if (updateHistory) {
      const currentHash = window.location.hash.replace('#', '');
      if (currentHash !== modalId) {
        history.pushState({ modal: modalId, tab: this.activeTab }, '', '#' + modalId);
      }
    }
  }

  closeModal(modalId, isFromPopstate = false) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');

    if (modalId === 'modal-feature-confirm' && this._pendingFeatConfirm?.onCancel) {
      this._pendingFeatConfirm.onCancel();
      this._pendingFeatConfirm = null;
    }
    if (modalId === 'modal-safety-audit' && this.pendingWrite?.onCancel) {
      this.pendingWrite.onCancel();
      this.pendingWrite = null;
    }

    if (!isFromPopstate) {
      const currentHash = window.location.hash.replace('#', '');
      if (currentHash === modalId) {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          history.replaceState({ tab: this.activeTab }, '', '#' + (this.activeTab || 'tab-cockpit'));
        }
      }
    }
  }

  closeAllModals(isFromPopstate = false) {
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
      this.closeModal(m.id, isFromPopstate);
    });
  }

  setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        this.switchTab(targetTab, true);
      });
    });

    const cockpitDtcsBtn = document.getElementById('btn-cockpit-view-dtcs');
    if (cockpitDtcsBtn) {
      cockpitDtcsBtn.addEventListener('click', () => {
        this.switchTab('tab-dtcs', true);
      });
    }

    // Modal backdrop clicks to dismiss
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closeModal(overlay.id);
        }
      });
    });

    // History popstate & back button handling
    window.addEventListener('popstate', (e) => {
      // 1. If any modal is currently visible, dismiss it
      const activeModals = document.querySelectorAll('.modal-overlay.active');
      if (activeModals.length > 0) {
        this.closeAllModals(true);
      }

      // 2. Resolve destination from location hash
      const hash = window.location.hash.replace('#', '');
      if (hash.startsWith('modal-')) {
        this.openModal(hash, false);
      } else if (hash && document.getElementById(hash) && document.querySelector(`.tab-btn[data-tab="${hash}"]`)) {
        this.switchTab(hash, false);
      } else {
        this.switchTab('tab-cockpit', false);
      }
    });

    // Prevent accidental navigation / tab closure when Bluetooth connected
    window.addEventListener('beforeunload', (e) => {
      if (this.bleTransport && this.bleTransport.isConnected) {
        e.preventDefault();
        e.returnValue = 'Bluetooth OBD-II adapter is currently connected. Leaving this page will disconnect vehicle communication.';
        return e.returnValue;
      }
    });

    // Initial page load hash parsing
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash.startsWith('modal-')) {
      this.switchTab('tab-cockpit', false);
      this.openModal(initialHash, false);
    } else if (initialHash && document.getElementById(initialHash) && document.querySelector(`.tab-btn[data-tab="${initialHash}"]`)) {
      this.switchTab(initialHash, false);
    } else {
      history.replaceState({ tab: 'tab-cockpit' }, '', '#tab-cockpit');
      this.switchTab('tab-cockpit', false);
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

  showToast(message, severity = 'info', duration = 4500) {
    const toast = document.getElementById('toast-banner');
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    // Apply colour based on severity
    if (severity === 'warning') {
      toast.style.background = 'rgba(245, 158, 11, 0.95)';
      toast.style.color = '#1c1917';
      toast.style.borderColor = '#f59e0b';
    } else if (severity === 'error') {
      toast.style.background = 'rgba(239, 68, 68, 0.95)';
      toast.style.color = '#fff';
      toast.style.borderColor = '#ef4444';
    } else {
      toast.style.background = '';
      toast.style.color = '';
      toast.style.borderColor = '';
    }
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
        if (this.isSimulated) {
          await this.stopSimulation();
          return;
        }

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
          <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="btn-show-linux-help" type="button" class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.78rem;">
              🛠️ View Chrome Flag Instructions
            </button>
            <button id="btn-notice-launch-sim" type="button" class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.78rem; background: rgba(56, 189, 248, 0.15); border-color: #38bdf8; color: #38bdf8;">
              🎮 Launch Vehicle Simulator
            </button>
          </div>
        </div>
      `;
      document.getElementById('btn-show-linux-help')?.addEventListener('click', () => {
        this.openBleHelpModal();
      });
      document.getElementById('btn-notice-launch-sim')?.addEventListener('click', () => {
        const modal = document.getElementById('modal-simulator');
        if (modal) modal.classList.add('active');
      });
      return;
    }

    noticeEl.innerHTML = `
      <span style="font-size: 1.4rem;">⚡</span>
      <div style="flex:1;">
        <h4 style="font-size: 0.95rem; font-weight: 700; color: #fbbf24;">Bluetooth Disconnected</h4>
        <p style="font-size: 0.82rem; color: #cbd5e1; margin-top: 2px;">
          Tap <strong>Connect BLE</strong> above to pair with your OBD-II adapter, or launch the <strong>Vehicle Simulator</strong> to test all features offline.
        </p>
        <div style="margin-top: 8px;">
          <button id="btn-notice-launch-sim" type="button" class="btn btn-secondary" style="padding: 4px 12px; font-size: 0.78rem; background: rgba(56, 189, 248, 0.15); border-color: #38bdf8; color: #38bdf8;">
            🎮 Launch Vehicle Simulator
          </button>
        </div>
      </div>
    `;
    document.getElementById('btn-notice-launch-sim')?.addEventListener('click', () => {
      const modal = document.getElementById('modal-simulator');
      if (modal) modal.classList.add('active');
    });
  }

  setupSimulator() {
    const openBtn = document.getElementById('btn-open-sim-modal');
    const closeBtn = document.getElementById('btn-close-sim');
    const modal = document.getElementById('modal-simulator');
    const form = document.getElementById('form-simulator');
    const disconnectBtn = document.getElementById('btn-disconnect-sim');
    const toggleEngineBtn = document.getElementById('btn-sim-toggle-engine');

    const openModal = () => {
      if (!modal) return;
      modal.classList.add('active');
      const activeControls = document.getElementById('sim-active-controls');
      const startBtn = document.getElementById('btn-start-sim');
      if (this.isSimulated && this.bleTransport && this.bleTransport.isConnected) {
        if (activeControls) activeControls.style.display = 'block';
        if (disconnectBtn) disconnectBtn.style.display = 'inline-block';
        if (startBtn) startBtn.textContent = 'Switch Profile / Reconnect';
        const nameEl = document.getElementById('sim-active-profile-name');
        if (nameEl) nameEl.textContent = SIM_PROFILES[this.simProfileId]?.name || this.simProfileId;
      } else {
        if (activeControls) activeControls.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        if (startBtn) startBtn.textContent = 'Connect Virtual Vehicle';
      }
    };

    openBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', () => modal?.classList.remove('active'));

    disconnectBtn?.addEventListener('click', async () => {
      await this.stopSimulation();
      modal?.classList.remove('active');
    });

    toggleEngineBtn?.addEventListener('click', () => {
      if (this.isSimulated && this.bleTransport && typeof this.bleTransport.setEngineRunning === 'function') {
        const nextState = !this.bleTransport.engineRunning;
        this.bleTransport.setEngineRunning(nextState);
        this.showToast(`Simulated engine is now: ${nextState ? 'RUNNING (Live Driving Telemetry)' : 'OFF (Ignition ON / Ready for Coding)'}`);
      }
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const profileSelect = document.getElementById('sim-profile-select');
      const engineSelect = document.getElementById('sim-engine-state');
      const profileId = profileSelect ? profileSelect.value : 'transporter_t5';
      const engineRunning = engineSelect ? engineSelect.value === 'running' : false;

      modal?.classList.remove('active');
      await this.startSimulation(profileId, engineRunning);
    });
  }

  async startSimulation(profileId = 'transporter_t5', engineRunning = false) {
    if (this.bleTransport && this.bleTransport.isConnected) {
      await this.bleTransport.disconnect();
      this.telemetryEngine.stop();
    }

    this.isSimulated = true;
    this.simProfileId = profileId;
    this.bleTransport = new SimulatedBleTransport(profileId);
    this.bleTransport.setEngineRunning(engineRunning);

    // Bind simulated transport to engine components
    this.udsClient.transport = this.bleTransport;
    this.safetyPipeline.transport = this.bleTransport;
    this.telemetryEngine.bleTransport = this.bleTransport;
    this.maintenanceManager.bleTransport = this.bleTransport;

    this.showToast(`🎮 Virtual Simulator Activated: ${SIM_PROFILES[profileId]?.name || profileId}`);
    await this.handleBleConnect();

    // Update status badge
    const statusText = document.getElementById('status-text');
    if (statusText) {
      const prof = SIM_PROFILES[profileId] || {};
      statusText.innerHTML = `🎮 Sim: <strong style="color:#38bdf8;">${prof.platform || 'VAG'}</strong>`;
    }
  }

  async stopSimulation() {
    if (this.bleTransport) {
      await this.bleTransport.disconnect();
    }
    this.telemetryEngine.stop();
    this.isSimulated = false;
    this.bleTransport = new WebBleTransport();
    this.udsClient.transport = this.bleTransport;
    this.safetyPipeline.transport = this.bleTransport;
    this.telemetryEngine.bleTransport = this.bleTransport;
    this.maintenanceManager.bleTransport = this.bleTransport;
    this.updateConnectionStatus(false);
    this.showToast('Simulator disconnected. Standard Bluetooth mode active.');
  }

  showVehicleLoading(step, title, text) {
    const modal = document.getElementById('modal-vehicle-loading');
    const titleEl = document.getElementById('loading-vehicle-title');
    const stepEl = document.getElementById('loading-vehicle-step');
    if (modal) modal.classList.add('active');
    if (titleEl && title) titleEl.textContent = title;
    if (stepEl && text) stepEl.textContent = text;

    const steps = ['ble', 'vin', 'specs', 'coding', 'done'];
    const stepIdx = steps.indexOf(step);

    ['ble', 'vin', 'specs', 'coding'].forEach((s, idx) => {
      const el = document.getElementById('step-' + s);
      const icon = document.getElementById('icon-step-' + s);
      if (!el || !icon) return;

      if (idx < stepIdx || step === 'done') {
        el.style.color = '#34d399';
        icon.textContent = '✅';
      } else if (idx === stepIdx) {
        el.style.color = '#38bdf8';
        icon.textContent = '⏳';
      } else {
        el.style.color = '#64748b';
        icon.textContent = '⚪';
      }
    });
  }

  hideVehicleLoading() {
    const modal = document.getElementById('modal-vehicle-loading');
    if (modal) modal.classList.remove('active');
  }

  getVehicleReg(vin = null) {
    const targetVin = vin || this.vin;
    try {
      if (targetVin && targetVin !== 'Unassigned Vehicles' && targetVin !== 'UNKNOWN') {
        const stored = localStorage.getItem('vibesodb2_reg_' + targetVin);
        if (stored) return stored;
      }
      return localStorage.getItem('vibesodb2_last_reg') || '';
    } catch (e) {
      return '';
    }
  }

  setVehicleReg(vin, reg) {
    const cleanReg = (reg || '').toUpperCase().trim();
    try {
      if (vin && vin !== 'Unassigned Vehicles' && vin !== 'UNKNOWN') {
        if (cleanReg) {
          localStorage.setItem('vibesodb2_reg_' + vin, cleanReg);
        } else {
          localStorage.removeItem('vibesodb2_reg_' + vin);
        }
      }
      if (cleanReg) {
        localStorage.setItem('vibesodb2_last_reg', cleanReg);
      }
    } catch (e) {}
    this.updateVehicleRegUI();
  }

  updateVehicleRegUI() {
    const reg = this.getVehicleReg(this.vin);
    const regBadge = document.getElementById('display-vehicle-reg');
    if (regBadge) {
      regBadge.textContent = reg || 'Enter Reg';
      regBadge.style.opacity = reg ? '1' : '0.6';
    }
    const infoVin = document.getElementById('info-vehicle-vin');
    if (infoVin && this.vin) {
      infoVin.textContent = this.vin.startsWith('REG_') ? 'Manually Assigned' : this.vin;
    }
  }

  openEditRegModal(vin = null) {
    const modal = document.getElementById('modal-edit-reg');
    const inputReg = document.getElementById('input-vehicle-reg');
    const inputVin = document.getElementById('input-vehicle-vin');
    const vinStatus = document.getElementById('modal-reg-vin-status');
    const descEl = document.getElementById('modal-reg-desc');
    if (!modal) return;

    let targetVin = vin || this.vin;
    if (targetVin === 'Unassigned Vehicles' || targetVin === 'UNKNOWN') {
      targetVin = '';
    }

    this._targetRegVin = targetVin;

    if (inputVin) {
      inputVin.value = targetVin || '';
      if (targetVin && targetVin.length === 17) {
        if (vinStatus) vinStatus.textContent = '• Auto-detected';
      } else {
        if (vinStatus) vinStatus.textContent = '• Optional or manual entry';
      }
    }

    if (inputReg) {
      inputReg.value = this.getVehicleReg(targetVin);
      setTimeout(() => inputReg.focus(), 150);
    }

    if (descEl) {
      if (targetVin) {
        descEl.innerHTML = `Assign a registration number (e.g. <strong style="color:#fbbf24;">AB12 CDE</strong>) to VIN (<span style="font-family:var(--font-mono); color:#38bdf8;">${targetVin}</span>) to organize backups and identify this vehicle.`;
      } else {
        descEl.innerHTML = `Assign a registration number (e.g. <strong style="color:#fbbf24;">AB12 CDE</strong>) to identify this vehicle and organize backups.`;
      }
    }

    modal.classList.add('active');
  }

  setupEditRegModal() {
    const modal = document.getElementById('modal-edit-reg');
    const form = document.getElementById('form-edit-reg');
    const cancelBtn = document.getElementById('btn-cancel-edit-reg');
    const editCockpitBtn = document.getElementById('btn-edit-vehicle-reg');

    if (editCockpitBtn) {
      editCockpitBtn.addEventListener('click', () => {
        this.openEditRegModal(this.vin);
      });
    }

    if (cancelBtn && modal) {
      cancelBtn.addEventListener('click', () => modal.classList.remove('active'));
    }

    if (form && modal) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const inputReg = document.getElementById('input-vehicle-reg');
        const inputVin = document.getElementById('input-vehicle-vin');
        const regVal = inputReg ? inputReg.value.trim().toUpperCase() : '';
        const vinVal = inputVin ? inputVin.value.trim().toUpperCase() : '';

        // Determine effective VIN/Vehicle ID
        let effectiveVin = vinVal || this._targetRegVin || this.vin;
        if (!effectiveVin || effectiveVin === 'Unassigned Vehicles' || effectiveVin === 'UNKNOWN') {
          effectiveVin = regVal ? 'REG_' + regVal.replace(/[^A-Z0-9]/g, '') : 'MANUAL_VEHICLE';
        }

        this.vin = effectiveVin;
        this._targetRegVin = effectiveVin;
        try {
          localStorage.setItem('vibesodb2_last_vehicle_id', effectiveVin);
        } catch (_) {}

        if (regVal) {
          this.setVehicleReg(effectiveVin, regVal);

          // If a full 17-character VIN was entered, decode platform and specs
          if (effectiveVin.length === 17) {
            const decoded = decodeVin(effectiveVin);
            if (decoded) {
              this.detectedPlatform = decoded.platform;
              this.detectedModel = decoded.model;

              let targetSchemaKey = null;
              if (decoded.platform === 'PQ25') {
                targetSchemaKey = 'pq25_bcm_0x09';
              } else if (decoded.platform === 'PQ35' || decoded.platform === 'PQ46') {
                targetSchemaKey = 'pq35_bcm_0x09';
              } else if (decoded.platform.startsWith('MQB')) {
                targetSchemaKey = 'mqb_bcm_0x09';
              }

              if (targetSchemaKey && BUNDLED_SCHEMAS[targetSchemaKey]) {
                this.selectedSchemaKey = targetSchemaKey;
                this.currentSchema = BUNDLED_SCHEMAS[this.selectedSchemaKey];
                const sel = document.getElementById('schema-select');
                if (sel) sel.value = this.selectedSchemaKey;
              }
              this.checkPlatformCompatibility();
            }
          }

          this.showToast(`Vehicle registration saved: ${regVal}`);
        } else {
          this.setVehicleReg(effectiveVin, '');
          this.showToast('Registration cleared');
        }

        // Update UI displays
        this.updateVehicleRegUI();
        if (typeof this.renderBackupsList === 'function') {
          this.renderBackupsList();
        }

        modal.classList.remove('active');
      });
    }
  }

  setupFuelEconomy() {
    this.fuelEconomyUnit = 'mpg_uk';
    try {
      this.fuelEconomyUnit = localStorage.getItem('vibesodb2_fuel_unit') || 'mpg_uk';
    } catch (e) {}

    const toggleBtn = document.getElementById('btn-toggle-fuel-unit');
    if (toggleBtn) {
      toggleBtn.textContent = this.fuelEconomyUnit === 'mpg_uk' ? 'Units: UK MPG' : 'Units: US MPG';
      toggleBtn.addEventListener('click', () => {
        this.fuelEconomyUnit = this.fuelEconomyUnit === 'mpg_uk' ? 'mpg_us' : 'mpg_uk';
        try {
          localStorage.setItem('vibesodb2_fuel_unit', this.fuelEconomyUnit);
        } catch (e) {}
        toggleBtn.textContent = this.fuelEconomyUnit === 'mpg_uk' ? 'Units: UK MPG' : 'Units: US MPG';
        if (this.telemetryEngine && this.telemetryEngine.latestMetrics) {
          this.renderTelemetry(this.telemetryEngine.latestMetrics);
        }
      });
    }
  }

  async handleBleConnect() {
    const bleBtn = document.getElementById('btn-ble-connect');
    if (bleBtn) bleBtn.textContent = 'Connecting...';

    this.showVehicleLoading('ble', 'Connecting to Bluetooth Adapter...', 'Requesting BLE device and establishing GATT connection...');

    try {
      const result = await this.bleTransport.connect();

      if (result) {
        this.updateConnectionStatus(true);
        this.vibrate([50, 50, 50]);

        // Check vehicle ignition state and battery voltage
        await this.checkIgnitionState();

        if (this.ignitionState === 'off') {
          this.showVehicleLoading('ignition', 'Vehicle Ignition is OFF', 'Bluetooth connected, but vehicle ECUs are powered down. Turn ignition key to Position 2 (dash lights ON, engine OFF) to communicate.');
          await new Promise(r => setTimeout(r, 1200));
        }

        // Run vehicle identification, specs interrogation, and automatic Long Coding read
        await this.handlePostConnectSetup();

        // Start background ignition monitoring interval
        this.startIgnitionPolling();

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
      this.hideVehicleLoading();
    }
  }

  async handlePostConnectSetup() {
    this.showVehicleLoading('vin', 'Detecting Vehicle Platform...', 'Reading Vehicle Identification Number (VIN) via OBD-II & UDS...');

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

      if (!vin) {
        // Fallback for older VAG KWP2000 vehicles (Transporter T5, Golf Mk4/Mk5 pre-UDS)
        const kwpModules = ['0x17', '0x19', '0x01'];
        for (const mod of kwpModules) {
          try {
            await this.udsClient.setModuleAddress(mod);
            const kwpRes90 = await this.udsClient.sendUdsRequest(new Uint8Array([0x1A, 0x90]), 1500).catch(() => null);
            if (kwpRes90) {
              vin = this._extractVinFromBytes(kwpRes90);
              if (vin) break;
            }
            const kwpRes9B = await this.udsClient.sendUdsRequest(new Uint8Array([0x1A, 0x9B]), 1500).catch(() => null);
            if (kwpRes9B) {
              vin = this._extractVinFromBytes(kwpRes9B);
              if (vin) break;
            }
          } catch (_) {}
        }
      }

      if (vin) {
        this.vin = vin;
        console.log('Vehicle VIN detected:', vin);
        const decoded = decodeVin(vin);
        if (decoded) {
          this.detectedPlatform = decoded.platform;
          this.detectedModel = decoded.model;

          let targetSchemaKey = null;
          if (decoded.platform === 'PQ25') {
            targetSchemaKey = 'pq25_bcm_0x09';
          } else if (decoded.platform === 'PQ35' || decoded.platform === 'PQ46') {
            targetSchemaKey = 'pq35_bcm_0x09';
          } else if (decoded.platform.startsWith('MQB')) {
            targetSchemaKey = 'mqb_bcm_0x09';
          }

          if (targetSchemaKey && BUNDLED_SCHEMAS[targetSchemaKey]) {
            console.log(`Auto-switched schema to ${targetSchemaKey} based on VIN platform (${decoded.platform})`);
            this.selectedSchemaKey = targetSchemaKey;
            this.currentSchema = BUNDLED_SCHEMAS[this.selectedSchemaKey];
            const sel = document.getElementById('schema-select');
            if (sel) sel.value = this.selectedSchemaKey;
          }
        }
        this.checkPlatformCompatibility();
        this.updateVehicleRegUI();
      }

      // 2. Query ECU Specifications (Part No, Hardware, Software, Serial No) via UDS
      this.showVehicleLoading('specs', 'Interrogating ECU Specs...', 'Reading part numbers, hardware revisions, and software versions...');
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

      // 3. Read live Long Coding from target module (BCM 0x09) automatically!
      const targetMod = this.currentSchema.module_address || '0x09';
      this.showVehicleLoading('coding', 'Reading Vehicle Long Coding...', `Retrieving authentic EEPROM configuration from module ${targetMod}...`);
      try {
        await this.readLiveCodingFromVehicle(true);
      } catch (ce) {
        console.warn('Post-connect live coding read fallback:', ce);
      }

      // All connection steps complete!
      this.showVehicleLoading('done', 'Vehicle Connected & Ready!', 'Vehicle platform detected and live coding synchronized.');
      await new Promise(r => setTimeout(r, 600));

      // 4. If this vehicle does not have a license plate / reg registered, prompt user!
      if (!this.getVehicleReg(this.vin)) {
        setTimeout(() => {
          this.openEditRegModal(this.vin);
        }, 400);
      }

      // 5. Automatic Background Diagnostic Trouble Code (DTC) Scan
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
    } finally {
      this.hideVehicleLoading();
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
    } else if (bytes.length >= 18 && bytes[0] === 0x5A) {
      bytes = bytes.subarray(1);
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

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.closeModal('modal-feature-confirm');
      });
    }

    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        const pending = this._pendingFeatConfirm;
        this._pendingFeatConfirm = null;
        this.closeModal('modal-feature-confirm');
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

    const prereqBox = document.getElementById('confirm-feat-prereq-box');
    const prereqText = document.getElementById('confirm-feat-prereq-text');
    if (prereqBox && prereqText) {
      if (feature.prerequisites) {
        prereqBox.style.display = 'block';
        prereqText.textContent = `${feature.prerequisites} If your car is not equipped with this factory hardware, enabling this option may trigger diagnostic fault codes or have no effect.`;
      } else {
        prereqBox.style.display = 'none';
      }
    }

    this.openModal('modal-feature-confirm');
  }

  checkPlatformCompatibility() {
    const banner = document.getElementById('coding-platform-mismatch-banner');
    const textEl = document.getElementById('coding-platform-mismatch-text');
    const autoSwitchBtn = document.getElementById('btn-auto-switch-schema');
    if (!banner || !textEl) return;

    if (!this.detectedPlatform) {
      banner.style.display = 'none';
      return;
    }

    let recommendedSchemaKey = null;
    if (this.detectedPlatform === 'PQ25') {
      recommendedSchemaKey = 'pq25_bcm_0x09';
    } else if (this.detectedPlatform === 'PQ35' || this.detectedPlatform === 'PQ46') {
      recommendedSchemaKey = 'pq35_bcm_0x09';
    } else if (this.detectedPlatform.startsWith('MQB')) {
      recommendedSchemaKey = 'mqb_bcm_0x09';
    }

    const currentPlatform = this.currentSchema.platform || 'Unknown';
    const isMismatch = recommendedSchemaKey && (this.selectedSchemaKey !== recommendedSchemaKey) && !this.selectedSchemaKey.startsWith(this.detectedPlatform.toLowerCase().replace(/[^a-z0-9]/g, ''));

    if (isMismatch) {
      const recSchema = BUNDLED_SCHEMAS[recommendedSchemaKey];
      banner.style.display = 'block';
      textEl.textContent = `Connected vehicle is a ${this.detectedModel || 'VAG vehicle'} (${this.detectedPlatform}), but active settings are for ${currentPlatform}. Features and byte locations will not match your car.`;
      if (autoSwitchBtn) {
        autoSwitchBtn.textContent = `Switch to ${this.detectedPlatform} (${recSchema ? recSchema.platform : recommendedSchemaKey})`;
        autoSwitchBtn.onclick = () => {
          this.selectedSchemaKey = recommendedSchemaKey;
          this.currentSchema = BUNDLED_SCHEMAS[this.selectedSchemaKey];
          const sel = document.getElementById('schema-select');
          if (sel) sel.value = this.selectedSchemaKey;
          this.checkPlatformCompatibility();
          this.renderFeatureList();
          this.renderByteGrid();
          this.renderBitSwitches();
          this.showToast(`Switched definitions to ${this.currentSchema.platform}`);
        };
      }
    } else {
      banner.style.display = 'none';
    }
  }

  openBleHelpModal() {
    this.openModal('modal-ble-help');
  }

  closeBleHelpModal() {
    this.closeModal('modal-ble-help');
  }

  setupIgnitionHandlers() {
    const recheckBtn1 = document.getElementById('btn-recheck-ignition');
    const recheckBtn2 = document.getElementById('btn-recheck-ignition-coding');
    const recheckBtn3 = document.getElementById('btn-recheck-ignition-dtcs');

    const handleRecheck = async (btn) => {
      if (btn) {
        btn.textContent = 'Checking...';
        btn.disabled = true;
      }
      await this.checkIgnitionState();
      if (btn) {
        btn.textContent = '🔄 Check Ignition';
        btn.disabled = false;
      }
    };

    if (recheckBtn1) recheckBtn1.addEventListener('click', () => handleRecheck(recheckBtn1));
    if (recheckBtn2) recheckBtn2.addEventListener('click', () => handleRecheck(recheckBtn2));
    if (recheckBtn3) recheckBtn3.addEventListener('click', () => handleRecheck(recheckBtn3));
  }

  startIgnitionPolling() {
    this.stopIgnitionPolling();
    this._ignitionPollTimer = setInterval(async () => {
      if (this.bleTransport && this.bleTransport.isConnected && !this.isBusBusy) {
        await this.checkIgnitionState(true);
      }
    }, 3500);
  }

  stopIgnitionPolling() {
    if (this._ignitionPollTimer) {
      clearInterval(this._ignitionPollTimer);
      this._ignitionPollTimer = null;
    }
  }

  async checkIgnitionState(suppressUi = false) {
    if (!this.bleTransport || !this.bleTransport.isConnected) {
      this.ignitionState = 'disconnected';
      this.batteryVoltage = null;
      this.updateIgnitionUI();
      return 'disconnected';
    }

    if (this.isSimulated) {
      const sim = this.bleTransport;
      this.batteryVoltage = sim.batteryVoltage || 12.4;
      this.ignitionState = sim.engineRunning ? 'running' : 'on';
      this.updateIgnitionUI();
      return this.ignitionState;
    }

    const wasOff = this.ignitionState === 'off';

    try {
      // 1. Read battery voltage from adapter via ATRV
      try {
        const vResp = await this.bleTransport.sendCommand('ATRV', 1200);
        const vMatch = (vResp || '').match(/(\d+\.?\d*)\s*V/i);
        if (vMatch) {
          this.batteryVoltage = parseFloat(vMatch[1]);
        }
      } catch (_) {}

      // 2. Query OBD-II RPM (01 0C) with broad 7DF header to test Terminal 15 response
      await this.bleTransport.setHeader('7DF');
      const rpmResp = await this.bleTransport.sendCommand('01 0C', 2000);
      const clean = (rpmResp || '').toUpperCase();

      if (clean.includes('41 0C') || clean.includes('410C')) {
        // ECU responded! Parse RPM
        const tokens = clean.replace(/41\s*0C/g, '410C').split(/\s+/);
        let rpm = 0;
        for (let i = 0; i < tokens.length; i++) {
          if (tokens[i].startsWith('410C') && tokens[i].length >= 8) {
            const rawHex = tokens[i].substring(4, 8);
            rpm = parseInt(rawHex, 16) / 4;
            break;
          } else if (tokens[i] === '410C' && i + 2 < tokens.length) {
            const a = parseInt(tokens[i + 1], 16);
            const b = parseInt(tokens[i + 2], 16);
            rpm = ((a * 256) + b) / 4;
            break;
          }
        }

        if (rpm > 300) {
          this.ignitionState = 'running';
        } else {
          this.ignitionState = 'on';
        }

        if (wasOff && this.ignitionState === 'on') {
          this.showToast('🔑 Vehicle Ignition Detected: ECUs are active and ready!');
          // Trigger live coding read if we haven't read authentic coding yet
          if (!this.hasCapturedBaseline) {
            this.readLiveCodingFromVehicle(true).catch(() => {});
          }
        }
      } else {
        // No response from engine ECU -> Ignition is OFF
        this.ignitionState = 'off';
      }
    } catch (err) {
      this.ignitionState = 'off';
    }

    this.updateIgnitionUI();
    return this.ignitionState;
  }

  updateIgnitionUI() {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const bannerIgnitionOff = document.getElementById('banner-ignition-off');
    const codingIgnitionNotice = document.getElementById('coding-ignition-notice');
    const dtcsIgnitionNotice = document.getElementById('dtcs-ignition-notice');
    const applyHexBtn = document.getElementById('btn-apply-hex');
    const clearDtcsBtn = document.getElementById('btn-clear-dtcs');
    const liveCodingBtn = document.getElementById('btn-read-live-coding');

    const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);
    if (!isConnected) {
      if (bannerIgnitionOff) bannerIgnitionOff.style.display = 'none';
      if (codingIgnitionNotice) codingIgnitionNotice.style.display = 'none';
      if (dtcsIgnitionNotice) dtcsIgnitionNotice.style.display = 'none';
      return;
    }

    const vStr = this.batteryVoltage ? `${this.batteryVoltage.toFixed(1)}V • ` : '';

    if (this.ignitionState === 'off') {
      if (statusDot) statusDot.className = 'dot dot-ignition-off';
      if (statusText) statusText.innerHTML = `<span style="color:#f59e0b; font-weight:700;">🔴 ${vStr}Ignition OFF</span>`;
      if (bannerIgnitionOff) bannerIgnitionOff.style.display = 'flex';
      if (codingIgnitionNotice) codingIgnitionNotice.style.display = 'flex';
      if (dtcsIgnitionNotice) dtcsIgnitionNotice.style.display = 'flex';

      // Lock write actions
      if (applyHexBtn) {
        applyHexBtn.disabled = true;
        applyHexBtn.title = 'Vehicle ignition must be switched ON to write coding.';
      }
      if (clearDtcsBtn) {
        clearDtcsBtn.disabled = true;
        clearDtcsBtn.title = 'Vehicle ignition must be switched ON to clear fault codes.';
      }
      if (liveCodingBtn) {
        liveCodingBtn.title = 'Switch ignition to ON (Position 2) before reading ECU coding.';
      }
    } else if (this.ignitionState === 'running') {
      if (statusDot) statusDot.className = 'dot connected';
      if (statusText) statusText.innerHTML = `<span style="color:#10b981; font-weight:700;">🚗 ${vStr}Engine Running</span>`;
      if (bannerIgnitionOff) bannerIgnitionOff.style.display = 'none';
      if (codingIgnitionNotice) codingIgnitionNotice.style.display = 'none';
      if (dtcsIgnitionNotice) dtcsIgnitionNotice.style.display = 'none';

      // Lock writes because engine is running (Engine Running Interlock)
      if (applyHexBtn) {
        applyHexBtn.disabled = true;
        applyHexBtn.title = 'Engine is running. Turn engine OFF (Ignition ON only) to write coding.';
      }
      if (clearDtcsBtn) clearDtcsBtn.disabled = false;
    } else { // 'on'
      if (statusDot) statusDot.className = 'dot connected';
      if (statusText) statusText.innerHTML = `<span style="color:#34d399; font-weight:700;">🟢 ${vStr}Ignition ON</span>`;
      if (bannerIgnitionOff) bannerIgnitionOff.style.display = 'none';
      if (codingIgnitionNotice) codingIgnitionNotice.style.display = 'none';
      if (dtcsIgnitionNotice) dtcsIgnitionNotice.style.display = 'none';

      // Enable write actions
      if (applyHexBtn) {
        applyHexBtn.disabled = false;
        applyHexBtn.title = 'Audit & Write Hex to Vehicle ECU';
      }
      if (clearDtcsBtn) clearDtcsBtn.disabled = false;
    }
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
    const quickScanBtn = document.getElementById('btn-quick-scan-dtcs');
    const clearBtn = document.getElementById('btn-clear-dtcs');
    const exportBtn = document.getElementById('btn-export-dtcs');
    const applyHexBtn = document.getElementById('btn-apply-hex');
    const resetHexBtn = document.getElementById('btn-reset-hex');
    const rawHexInput = document.getElementById('raw-hex-input');

    if (connected) {
      if (bleBtn) {
        bleBtn.classList.add('connected');
        bleBtn.textContent = this.isSimulated ? 'Disconnect Sim' : 'Disconnect BLE';
      }
      if (statusDot) {
        statusDot.className = 'dot connected';
      }
      if (statusText) {
        if (this.isSimulated) {
          const prof = SIM_PROFILES[this.simProfileId] || {};
          statusText.innerHTML = `🎮 <span style="color:#38bdf8; font-weight:700;">Sim: ${prof.name || 'Virtual Vehicle'}</span>`;
        } else {
          statusText.textContent = this.bleTransport.device?.name || 'BLE Connected';
        }
      }
      if (cockpitNotice) cockpitNotice.style.display = 'none';
      if (codingNotice) codingNotice.style.display = 'none';
      if (matrixNotice) matrixNotice.style.display = 'none';
      if (serviceNotice) serviceNotice.style.display = 'none';
      if (dtcsNotice) dtcsNotice.style.display = 'none';

      if (scanBtn) { scanBtn.disabled = false; scanBtn.title = 'Full Vehicle Auto-Scan'; }
      if (quickScanBtn) { quickScanBtn.disabled = false; quickScanBtn.title = 'Quick Scan (Engine & Electrics)'; }
      if (clearBtn) { clearBtn.disabled = false; clearBtn.title = 'Clear All DTCs'; }
      if (exportBtn) { exportBtn.disabled = false; }
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

      // Keep scan buttons active in demo mode to allow offline exploration of the diagnostic knowledge base
      if (scanBtn) { scanBtn.disabled = false; scanBtn.title = 'Run Simulated Auto-Scan (Demo Mode)'; }
      if (quickScanBtn) { quickScanBtn.disabled = false; quickScanBtn.title = 'Run Simulated Quick Scan (Demo Mode)'; }
      if (clearBtn) { clearBtn.disabled = false; clearBtn.title = 'Clear DTCs'; }
      if (exportBtn) { exportBtn.disabled = false; }
      if (applyHexBtn) { applyHexBtn.disabled = true; applyHexBtn.title = 'Connect Bluetooth to write hex'; }
      if (resetHexBtn) { resetHexBtn.disabled = true; resetHexBtn.title = 'Connect Bluetooth to reset baseline'; }
      if (rawHexInput) rawHexInput.readOnly = true;

      // Clear cockpit telemetry metrics & vehicle specs when disconnected
      this.renderTelemetry({});
      this.clearVehicleSpecsDisplay();

      // Reset ignition state & stop polling
      this.stopIgnitionPolling();
      this.ignitionState = 'disconnected';
      this.batteryVoltage = null;
      this.updateIgnitionUI();
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

    // 13. Live Fuel Economy & Consumption
    const mpgEl = document.getElementById('val-cockpit-mpg');
    const l100El = document.getElementById('val-cockpit-l100');
    const rateEl = document.getElementById('val-cockpit-fuel-rate');
    const subEl = document.getElementById('val-cockpit-fuel-sub');
    const statusEl = document.getElementById('lbl-fuel-status');

    const isUK = this.fuelEconomyUnit !== 'mpg_us';
    const instantMpg = isUK ? data.instant_mpg_uk : data.instant_mpg_us;
    const mpgUnit = isUK ? 'MPG' : 'MPG (US)';

    if (mpgEl) {
      if (instantMpg != null && instantMpg > 0) {
        mpgEl.textContent = `${instantMpg.toFixed(1)} ${mpgUnit}`;
      } else {
        mpgEl.textContent = `-- ${mpgUnit}`;
      }
    }

    if (l100El) {
      if (data.instant_l_per_100km != null && data.instant_l_per_100km > 0) {
        l100El.textContent = `${data.instant_l_per_100km.toFixed(1)} L/100km`;
      } else {
        l100El.textContent = '-- L/100km';
      }
    }

    if (rateEl) {
      if (data.fuel_rate_l_per_h != null && data.fuel_rate_l_per_h > 0) {
        rateEl.textContent = `${data.fuel_rate_l_per_h.toFixed(2)} L/h`;
      } else {
        rateEl.textContent = '-- L/h';
      }
    }

    if (subEl && statusEl) {
      const spd = data.vehicle_speed_kmh;
      if (spd != null && spd > 3) {
        subEl.textContent = `In Motion (${Math.round(spd)} km/h)`;
        statusEl.textContent = 'Cruising Consumption';
        statusEl.style.color = '#38bdf8';
      } else if (data.engine_rpm != null && data.engine_rpm > 400) {
        subEl.textContent = 'Stationary Idling';
        statusEl.textContent = 'Idle Fuel Flow';
        statusEl.style.color = '#f59e0b';
      } else {
        subEl.textContent = 'Engine Fuel Flow';
        statusEl.textContent = 'Awaiting Telemetry';
        statusEl.style.color = '#cbd5e1';
      }
    }

    // 14. DPF Soot Measured & Ash Volume
    const sootMeasEl = document.getElementById('metric-soot-meas-val');
    if (sootMeasEl) {
      sootMeasEl.textContent = data.dpf_soot_measured_g != null 
        ? `${data.dpf_soot_measured_g.toFixed(1)} g` 
        : '-- g';
    }
    const ashEl = document.getElementById('metric-ash-val');
    if (ashEl) {
      ashEl.textContent = data.dpf_ash_mass_g != null 
        ? `${data.dpf_ash_mass_g.toFixed(1)} g` 
        : '-- g';
    }

    // 15. Draw Real-Time Telemetry Graph
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
        // Resize buffer if needed and vehicle baseline has not been captured yet
        const reqLen = this.currentSchema.expected_byte_length || 30;
        if (!this.hasCapturedBaseline && this.currentBytes.length !== reqLen) {
          const newBuf = new Uint8Array(reqLen);
          newBuf.set(this.currentBytes.subarray(0, Math.min(this.currentBytes.length, reqLen)));
          this.currentBytes = newBuf;
        }
        this.checkPlatformCompatibility();
        this.renderFeatureList();
        this.renderByteGrid();
        this.renderBitSwitches();
      });
    }

    // Add Custom Feature Modal Controls
    const openAddBtn = document.getElementById('btn-open-add-custom');
    const cancelAddBtn = document.getElementById('btn-cancel-custom-feat');
    const addForm = document.getElementById('form-add-custom-feature');

    if (openAddBtn) {
      openAddBtn.addEventListener('click', () => {
        this.openModal('modal-add-custom-feature');
        const nameInput = document.getElementById('custom-feat-name');
        if (nameInput) setTimeout(() => nameInput.focus(), 100);
      });
    }

    if (cancelAddBtn) {
      cancelAddBtn.addEventListener('click', () => {
        this.closeModal('modal-add-custom-feature');
      });
    }

    if (addForm) {
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
        this.closeModal('modal-add-custom-feature');
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
    const countUnsupportedEl = document.getElementById('count-feat-unsupported');
    const btnUnsupported = document.getElementById('btn-filter-unsupported');

    let activeCount = 0;
    let inactiveCount = 0;
    let unsupportedCount = 0;

    allFeatures.forEach(feat => {
      if (feat.byte >= this.currentBytes.length) {
        unsupportedCount++;
      } else {
        const isEnabled = (this.currentBytes[feat.byte] & (1 << feat.bit)) !== 0;
        if (isEnabled) activeCount++;
        else inactiveCount++;
      }
    });

    if (countAllEl) countAllEl.textContent = allFeatures.length;
    if (countActiveEl) countActiveEl.textContent = activeCount;
    if (countInactiveEl) countInactiveEl.textContent = inactiveCount;
    if (countUnsupportedEl) countUnsupportedEl.textContent = unsupportedCount;
    if (btnUnsupported) {
      btnUnsupported.style.display = unsupportedCount > 0 ? 'inline-block' : 'none';
    }
    if (bytesLenEl) bytesLenEl.textContent = this.currentBytes.length;

    let displayFeatures = allFeatures;
    if (this.featureFilter === 'active') {
      displayFeatures = allFeatures.filter(f => f.byte < this.currentBytes.length && (this.currentBytes[f.byte] & (1 << f.bit)) !== 0);
    } else if (this.featureFilter === 'inactive') {
      displayFeatures = allFeatures.filter(f => f.byte < this.currentBytes.length && (this.currentBytes[f.byte] & (1 << f.bit)) === 0);
    } else if (this.featureFilter === 'unsupported') {
      displayFeatures = allFeatures.filter(f => f.byte >= this.currentBytes.length);
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

    const isWritable = this.isWritable;
    const writeBlockedReason = isWritable ? '' : this.isWriteBlockedReason;

    Object.keys(grouped).forEach(category => {
      const catHeader = document.createElement('div');
      catHeader.style.cssText = 'margin: 1.25rem 0 0.5rem 0; font-size: 0.82rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(100, 116, 139, 0.2); padding-bottom: 4px;';
      catHeader.innerHTML = `<span>📁 ${category}</span> <span style="font-size: 0.72rem; padding: 1px 6px; border-radius: 4px; background: rgba(100, 116, 139, 0.2); color: #cbd5e1;">${grouped[category].length} setting${grouped[category].length > 1 ? 's' : ''}</span>`;
      container.appendChild(catHeader);

      grouped[category].forEach(feat => {
        const isOutOfBounds = feat.byte >= this.currentBytes.length;
        const isEnabled = !isOutOfBounds && ((this.currentBytes[feat.byte] & (1 << feat.bit)) !== 0);
        const wasOriginalEnabled = !isOutOfBounds && ((this.baselineBytes[feat.byte] & (1 << feat.bit)) !== 0);
        const isModified = !isOutOfBounds && (isEnabled !== wasOriginalEnabled);

        const item = document.createElement('div');
        item.className = `feature-item ${isModified ? 'feature-item-modified' : ''} ${isOutOfBounds ? 'feature-item-unsupported' : ''}`;
        if (isOutOfBounds) {
          item.style.opacity = '0.62';
          item.style.borderLeft = '3px solid #64748b';
          item.style.background = 'rgba(15, 23, 42, 0.35)';
        } else if (isModified) {
          item.style.borderLeft = '3px solid var(--warning)';
          item.style.background = 'rgba(245, 158, 11, 0.05)';
        } else if (isEnabled) {
          item.style.borderLeft = '3px solid #10b981';
        }

        const info = document.createElement('div');
        info.className = 'feature-info';

        let stateBadgeHtml = '';
        if (isOutOfBounds) {
          stateBadgeHtml = `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:0.7rem; padding:1px 6px; border-radius:4px; background:rgba(239, 68, 68, 0.15); color:#f87171; font-weight:700; border:1px solid rgba(239, 68, 68, 0.3); margin-left:6px;" title="This vehicle's ECU coding buffer has only ${this.currentBytes.length} bytes. Byte ${feat.byte} exceeds controller capacity.">
              🚫 Unsupported by ECU (Byte ${feat.byte} > Max ${this.currentBytes.length}B)
            </span>
          `;
        } else if (isModified) {
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

        let prereqHtml = '';
        if (feat.prerequisites) {
          prereqHtml = `
            <div style="margin-top: 4px; display: flex; align-items: center; gap: 4px;">
              <span style="font-size: 0.69rem; padding: 1px 6px; border-radius: 4px; background: rgba(234, 179, 8, 0.12); color: #facc15; border: 1px solid rgba(234, 179, 8, 0.25); display: inline-flex; align-items: center; gap: 4px;">
                ⚙️ Requires: ${feat.prerequisites}
              </span>
            </div>
          `;
        }

        info.innerHTML = `
          <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
            <h4 style="margin:0;">${feat.name}</h4>
            ${stateBadgeHtml}
          </div>
          <p style="margin:4px 0 2px 0;">${feat.description || ''}</p>
          ${prereqHtml}
          <div style="display:flex; align-items:center; gap:8px; margin-top:2px;">
            <span style="font-size: 0.72rem; color: #64748b; font-family: var(--font-mono)">
              [Byte ${feat.byte}, Bit ${feat.bit}]
            </span>
            ${isModified ? `<button type="button" class="btn-revert-feature" style="background:none; border:none; color:#38bdf8; font-size:0.72rem; cursor:pointer; text-decoration:underline; padding:0;">↺ Revert to Original (${wasOriginalEnabled ? 'ON' : 'OFF'})</button>` : ''}
          </div>
        `;

        if (isModified) {
          const revertBtn = info.querySelector('.btn-revert-feature');
          if (revertBtn) {
            if (!isWritable) {
              revertBtn.disabled = true;
              revertBtn.style.opacity = '0.38';
              revertBtn.style.cursor = 'not-allowed';
              revertBtn.title = writeBlockedReason;
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
        toggleLabel.className = `toggle-switch ${(!isWritable || isOutOfBounds) ? 'disabled' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isEnabled;
        if (!isWritable || isOutOfBounds) {
          checkbox.disabled = true;
          checkbox.title = isOutOfBounds
            ? `Feature is located at Byte ${feat.byte}, but vehicle ECU buffer is only ${this.currentBytes.length} bytes long.`
            : writeBlockedReason;
        }

        const slider = document.createElement('span');
        slider.className = 'slider';

        if (!isOutOfBounds) {
          checkbox.addEventListener('change', () => {
            if (!this.isWritable) {
              checkbox.checked = !checkbox.checked;
              this.showToast(this.isWriteBlockedReason, 'warning');
              return;
            }
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
        }

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

    const isWritable = this.isWritable;
    const writeBlockedReason = isWritable ? '' : this.isWriteBlockedReason;

    for (let bit = 7; bit >= 0; bit--) {
      const isBitSet = (currentVal & (1 << bit)) !== 0;
      const btn = document.createElement('button');
      btn.className = `bit-btn ${isBitSet ? 'active' : ''} ${!isWritable ? 'disabled' : ''}`;
      if (!isWritable) {
        btn.disabled = true;
        btn.title = writeBlockedReason;
      }
      btn.innerHTML = `<div>Bit ${bit}</div><div style="font-size: 1.1rem; margin-top:2px;">${isBitSet ? '1' : '0'}</div>`;

      btn.addEventListener('click', () => {
        if (!this.isWritable) {
          this.showToast(this.isWriteBlockedReason, 'warning');
          return;
        }
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
    const confirmBtn = document.getElementById('btn-modal-confirm');
    const cancelBtn = document.getElementById('btn-modal-cancel');

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.closeModal('modal-safety-audit');
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

          this.closeModal('modal-safety-audit');
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

    this.openModal('modal-safety-audit');
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

    // Group backups by VIN
    const groups = {};
    backups.slice().reverse().forEach(b => {
      const vin = b.vin || (this.vin && this.vin !== 'UNKNOWN' ? this.vin : 'Unassigned Vehicles');
      if (!groups[vin]) groups[vin] = [];
      groups[vin].push(b);
    });

    container.innerHTML = '';

    Object.entries(groups).forEach(([vinKey, items]) => {
      const reg = this.getVehicleReg(vinKey);
      const isTransporter = vinKey.includes('7H') || vinKey.includes('7E') || vinKey.includes('7J') || vinKey.startsWith('WV2');
      const vehicleIcon = isTransporter ? '🚐' : '🚗';
      const isUnassigned = vinKey === 'Unassigned Vehicles';

      const groupCard = document.createElement('div');
      groupCard.className = 'vin-group-card';

      const headerEl = document.createElement('div');
      headerEl.className = 'vin-group-header';
      headerEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
          <span style="font-size:1.4rem;">${vehicleIcon}</span>
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
              <span class="plate-badge" style="font-size:0.85rem;">${reg || (isUnassigned ? 'NO VIN' : 'NO REG')}</span>
              <strong style="font-family:var(--font-mono); font-size:0.9rem; color:#f8fafc;">${vinKey}</strong>
            </div>
            <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
              ${items.length} Snapshot${items.length > 1 ? 's' : ''} • Latest: ${new Date(items[0].timestamp).toLocaleString()}
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <button type="button" class="btn btn-secondary btn-edit-group-reg" data-vin="${isUnassigned ? '' : vinKey}" style="font-size:0.72rem; padding:3px 8px;">✏️ ${reg ? 'Edit Reg' : 'Set Reg'}</button>
          <span class="group-toggle-icon" style="font-size:0.9rem; color:#94a3b8;">▼</span>
        </div>
      `;

      const bodyEl = document.createElement('div');
      bodyEl.className = 'vin-group-body';

      items.forEach(b => {
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
                Module ${modAddr} • DID ${b.did || '0x0600'} • ${dateStr}
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

        bodyEl.appendChild(item);

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

      // Toggle group collapse
      headerEl.addEventListener('click', (e) => {
        if (e.target.closest('.btn-edit-group-reg')) return;
        bodyEl.classList.toggle('collapsed');
        const icon = headerEl.querySelector('.group-toggle-icon');
        if (icon) icon.textContent = bodyEl.classList.contains('collapsed') ? '▶' : '▼';
      });

      // Edit Registration button on group header
      const editBtn = headerEl.querySelector('.btn-edit-group-reg');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openEditRegModal(vinKey);
        });
      }

      groupCard.appendChild(headerEl);
      groupCard.appendChild(bodyEl);
      container.appendChild(groupCard);
    });
  }

  // --- Diagnostic Trouble Codes (DTC) Tab & Multi-Module Auto-Scan ---
  setupDtcsTab() {
    const scanBtn = document.getElementById('btn-scan-dtcs');
    const quickScanBtn = document.getElementById('btn-quick-scan-dtcs');
    const clearBtn = document.getElementById('btn-clear-dtcs');
    const exportBtn = document.getElementById('btn-export-dtcs');
    const searchInput = document.getElementById('dtc-search-input');

    if (scanBtn) {
      scanBtn.addEventListener('click', () => this.runDtcAutoScan(false));
    }
    if (quickScanBtn) {
      quickScanBtn.addEventListener('click', () => this.runDtcAutoScan(true));
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAllDtcFaults());
    }
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportDtcScanReport());
    }
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.dtcFilterText = e.target.value.toLowerCase().trim();
        this.renderDtcsList(this.lastDtcScanResults);
      });
    }

    // Render initial empty or cached state
    this.renderDtcsList(this.lastDtcScanResults);
  }

  async runDtcAutoScan(isQuick = false) {
    const scanBtn = document.getElementById('btn-scan-dtcs');
    const quickScanBtn = document.getElementById('btn-quick-scan-dtcs');
    const progressBox = document.getElementById('dtc-scan-progress');
    const progressBar = document.getElementById('dtc-scan-progressbar');
    const statusText = document.getElementById('dtc-scan-status-text');
    const percentText = document.getElementById('dtc-scan-percent');

    if (scanBtn) scanBtn.disabled = true;
    if (quickScanBtn) quickScanBtn.disabled = true;
    if (progressBox) progressBox.style.display = 'block';

    const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);

    try {
      let results = null;

      if (isConnected) {
        // Live hardware vehicle Auto-Scan
        const targetModules = isQuick ? ['0x01', '0x09', '0x15'] : null;
        results = await this.udsClient.autoScanVehicle((p) => {
          const pct = Math.round((p.index / p.total) * 100);
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (percentText) percentText.textContent = `${pct}%`;
          if (statusText) statusText.textContent = `Scanning ${p.moduleName} (${p.moduleHex})...`;
        }, targetModules);
      } else {
        // Realistic Demo Mode Auto-Scan matching the Transporter T5 scenario
        const demoModules = isQuick
          ? ['0x01', '0x09', '0x15']
          : ['0x01', '0x03', '0x08', '0x09', '0x15', '0x17', '0x19'];

        const modNames = {
          '0x01': 'Engine (ECM)',
          '0x03': 'ABS Brakes',
          '0x08': 'Climatronic / HVAC',
          '0x09': 'Cent. Elect. (BCM)',
          '0x15': 'Airbags (SRS)',
          '0x17': 'Instrument Cluster',
          '0x19': 'CAN Gateway'
        };

        for (let i = 0; i < demoModules.length; i++) {
          const mod = demoModules[i];
          const pct = Math.round(((i + 1) / demoModules.length) * 100);
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (percentText) percentText.textContent = `${pct}%`;
          if (statusText) statusText.textContent = `[Demo Mode] Scanning ${modNames[mod] || mod}...`;
          await new Promise(r => setTimeout(r, 140));
        }

        const dtc01117 = lookupDtc('01117', 0x28, '008');
        const dtc01598 = lookupDtc('01598', 0x29, '002');
        const dtc00588 = lookupDtc('00588', 0x33, '033');

        results = {
          modules: [
            {
              address: '0x09',
              name: 'Cent. Elect. (Bordnetz)',
              partNumber: '7H0 937 049 T',
              component: 'BORDNETZ SGVER 1.0 2001',
              coding: '0000100',
              protocol: 'KWP2000 / TP2.0',
              dtcs: [
                {
                  code: dtc01117.code,
                  title: dtc01117.title,
                  system: dtc01117.system,
                  meaning: dtc01117.meaning,
                  causes: dtc01117.causes,
                  fixes: dtc01117.fixes,
                  severity: dtc01117.severity,
                  symptom: '008 - Implausible Signal',
                  isStatic: false,
                  statusMask: '0x08'
                },
                {
                  code: dtc01598.code,
                  title: dtc01598.title,
                  system: dtc01598.system,
                  meaning: dtc01598.meaning,
                  causes: dtc01598.causes,
                  fixes: dtc01598.fixes,
                  severity: dtc01598.severity,
                  symptom: '002 - Lower Limit Exceeded',
                  isStatic: true,
                  statusMask: '0x02'
                }
              ]
            },
            {
              address: '0x15',
              name: 'Airbags (SRS)',
              partNumber: '1C0 909 605 A',
              component: '3B AIRBAG VW51 0009',
              coding: '13122',
              protocol: 'KWP2000 / TP2.0',
              dtcs: [
                {
                  code: dtc00588.code,
                  title: dtc00588.title,
                  system: dtc00588.system,
                  meaning: dtc00588.meaning,
                  causes: dtc00588.causes,
                  fixes: dtc00588.fixes,
                  severity: dtc00588.severity,
                  symptom: '33-00 - Resistance Too Low',
                  isStatic: true,
                  statusMask: '0x21'
                }
              ]
            },
            {
              address: '0x01',
              name: 'Engine (ECM)',
              partNumber: '03L 906 022 JE',
              component: 'R4 2.0L TDI G000AG 7967',
              coding: '0111001A020400080000',
              protocol: 'UDS (ISO 14229)',
              dtcs: []
            },
            {
              address: '0x03',
              name: 'ABS Brakes',
              partNumber: '7H0 907 379 S',
              component: 'ABS/ESP FRONT5.3 0004',
              coding: '0000068',
              protocol: 'KWP2000 / TP2.0',
              dtcs: []
            },
            {
              address: '0x17',
              name: 'Instrument Cluster',
              partNumber: '7H0 920 951 T',
              component: 'KOMBIINSTRUMENT VDO V01',
              coding: '00101',
              protocol: 'KWP2000 / TP2.0',
              dtcs: []
            },
            {
              address: '0x19',
              name: 'CAN Gateway',
              partNumber: '6N0 909 901',
              component: 'GATEWAY-K-CAN 1S20',
              coding: '00006',
              protocol: 'KWP2000 / TP2.0',
              dtcs: []
            }
          ],
          totalDtcCount: 3,
          scannedCount: demoModules.length,
          timestamp: new Date().toISOString()
        };
      }

      this.lastDtcScanResults = results;
      this.renderDtcsList(results);

      // Collect all DTCs across modules for Cockpit Alert
      const allDtcs = [];
      results.modules.forEach(m => {
        if (m.dtcs && m.dtcs.length > 0) {
          allDtcs.push(...m.dtcs);
        }
      });
      this.updateCockpitDtcAlert(allDtcs);
      this.vibrate([40]);

      if (!isConnected) {
        this.showToast('ℹ️ Offline Demo Mode: Simulated VAG Auto-Scan loaded.');
      }
    } catch (err) {
      alert('Diagnostic Auto-Scan failed: ' + (err.message || err));
    } finally {
      if (progressBox) progressBox.style.display = 'none';
      if (scanBtn) scanBtn.disabled = false;
      if (quickScanBtn) quickScanBtn.disabled = false;
    }
  }

  renderDtcsList(scanResult) {
    const container = document.getElementById('dtc-list-container');
    if (!container) return;

    const statScanned = document.getElementById('dtc-stat-scanned');
    const statFaults = document.getElementById('dtc-stat-faults');
    const statHealthy = document.getElementById('dtc-stat-healthy');

    if (!scanResult || (!scanResult.modules && (!Array.isArray(scanResult) || scanResult.length === 0))) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:2.5rem 1.5rem;">
          <span style="font-size:2.5rem;">🔍</span>
          <h4 style="margin-top:0.75rem; font-weight:700; font-size:1.05rem;">No Diagnostic Scan Active</h4>
          <p class="text-muted" style="font-size:0.83rem; max-width:480px; margin:6px auto 0;">
            Tap <strong>Full Auto-Scan</strong> above to interrogate all installed vehicle control modules, read confirmed and pending DTCs, and view mechanical fixes.
          </p>
        </div>
      `;
      if (statScanned) statScanned.textContent = '0';
      if (statFaults) statFaults.textContent = '0';
      if (statHealthy) statHealthy.textContent = '0';
      return;
    }

    // Normalize input (wrap array into modules format if needed)
    let modules = [];
    if (Array.isArray(scanResult)) {
      modules = [{
        address: '0x09',
        name: 'Target Control Module',
        partNumber: 'Installed Module',
        component: 'Electronic Control Unit',
        protocol: 'UDS',
        dtcs: scanResult
      }];
    } else {
      modules = scanResult.modules || [];
    }

    // Calculate totals
    const totalFaults = modules.reduce((sum, m) => sum + (m.dtcs ? m.dtcs.length : 0), 0);
    const healthyModules = modules.filter(m => !m.dtcs || m.dtcs.length === 0).length;

    if (statScanned) statScanned.textContent = modules.length;
    if (statFaults) statFaults.textContent = totalFaults;
    if (statHealthy) statHealthy.textContent = healthyModules;

    // Apply search filter
    const query = this.dtcFilterText || '';
    let visibleModules = modules;
    if (query) {
      visibleModules = modules.filter(mod => {
        const modMatch = mod.name.toLowerCase().includes(query) ||
                         mod.address.toLowerCase().includes(query) ||
                         (mod.partNumber && mod.partNumber.toLowerCase().includes(query));
        const dtcMatch = mod.dtcs && mod.dtcs.some(d => 
          (d.code && d.code.toLowerCase().includes(query)) ||
          (d.title && d.title.toLowerCase().includes(query)) ||
          (d.meaning && d.meaning.toLowerCase().includes(query)) ||
          (d.symptom && d.symptom.toLowerCase().includes(query)) ||
          (d.system && d.system.toLowerCase().includes(query))
        );
        return modMatch || dtcMatch;
      });
    }

    if (visibleModules.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:2rem;">
          <span style="font-size:2rem;">🔎</span>
          <h4 style="margin-top:0.5rem; font-weight:700;">No Matches Found</h4>
          <p class="text-muted" style="font-size:0.85rem; margin-top:4px;">No diagnostic fault codes or modules match "${query}".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';

    visibleModules.forEach(mod => {
      const modCard = document.createElement('div');
      modCard.className = 'card';
      modCard.style.marginBottom = '1.15rem';
      modCard.style.border = '1px solid var(--border-color)';

      const hasFaults = mod.dtcs && mod.dtcs.length > 0;
      const badgeStyle = hasFaults
        ? 'background:rgba(239,68,68,0.14); color:#ef4444; border:1px solid rgba(239,68,68,0.3);'
        : 'background:rgba(16,185,129,0.14); color:#10b981; border:1px solid rgba(16,185,129,0.3);';

      const badgeText = hasFaults
        ? `⚠️ ${mod.dtcs.length} Fault${mod.dtcs.length > 1 ? 's' : ''}`
        : `✅ No Faults / OK`;

      let headerHtml = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem; border-bottom:1px solid var(--border-color); padding-bottom:0.75rem; margin-bottom:0.75rem;">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span style="font-size:1.1rem;">${hasFaults ? '🔴' : '🟢'}</span>
              <h4 style="font-size:0.98rem; font-weight:700; margin:0; font-family:var(--font-mono);">
                Address ${mod.address}: ${mod.name}
              </h4>
            </div>
            <div style="font-size:0.78rem; color:var(--text-muted); margin-top:4px; font-family:var(--font-mono);">
              Part No: <strong>${mod.partNumber || 'N/A'}</strong> • Component: <strong>${mod.component || 'VAG ECU'}</strong>
              ${mod.coding ? ` • Coding: <code>${mod.coding}</code>` : ''} • Protocol: <span style="color:var(--text-main);">${mod.protocol || 'ISO 15765'}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span style="${badgeStyle} font-size:0.75rem; font-weight:700; padding:4px 10px; border-radius:12px;">
              ${badgeText}
            </span>
            ${hasFaults ? `
              <button class="btn btn-sm btn-outline-danger btn-clear-mod" data-mod="${mod.address}" 
                      style="padding:3px 9px; font-size:0.72rem; font-weight:600; cursor:pointer;" title="Clear DTCs for this module only">
                Clear Module
              </button>
            ` : ''}
          </div>
        </div>
      `;

      let bodyHtml = '';
      if (!hasFaults) {
        bodyHtml = `
          <div style="padding:0.25rem 0; font-size:0.82rem; color:var(--text-muted);">
            All monitored sub-systems and sensors in this module are reporting nominal tolerances.
          </div>
        `;
      } else {
        bodyHtml = '<div class="dtc-faults-wrapper" style="display:flex; flex-direction:column; gap:0.75rem;">';
        mod.dtcs.forEach((dtc, idx) => {
          bodyHtml += `
            <div class="dtc-fault-card" style="border-left: 4px solid var(--danger); background: rgba(239, 68, 68, 0.04); border-radius: 8px; padding: 0.95rem; border: 1px solid var(--border-color); border-left-width: 4px; border-left-color: var(--danger);">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
                <div>
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-family:var(--font-mono); font-size:1.1rem; font-weight:800; color:var(--danger); letter-spacing:0.5px;">
                      ${dtc.code}
                    </span>
                    <span style="font-weight:700; font-size:0.92rem; color:var(--text-main);">
                      ${dtc.title || 'Diagnostic Trouble Code'}
                    </span>
                  </div>
                  <div style="font-size:0.76rem; color:var(--text-muted); margin-top:3px;">
                    System: <strong>${dtc.system || 'General'}</strong>
                    ${dtc.statusMask ? ` • Status Mask: <code>${dtc.statusMask}</code>` : ''}
                  </div>
                </div>
                <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                  ${dtc.symptom ? `
                    <span style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3); font-size:0.74rem; font-weight:600; padding:2px 8px; border-radius:10px;">
                      ↳ ${dtc.symptom}
                    </span>
                  ` : ''}
                  <span style="${dtc.isStatic ? 'background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);' : 'background:rgba(100,116,139,0.15); color:#94a3b8; border:1px solid rgba(100,116,139,0.3);'} font-size:0.74rem; font-weight:600; padding:2px 8px; border-radius:10px;">
                    ${dtc.isStatic ? 'Static / Active' : 'Intermittent'}
                  </span>
                </div>
              </div>

              <!-- Collapsible Knowledge Base Accordion Drawer -->
              <button class="dtc-drawer-toggle" style="width:100%; margin-top:0.65rem; padding:6px 12px; background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.25); border-radius:6px; color:var(--primary); font-size:0.8rem; font-weight:600; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.15s;">
                <span>💡 What it means & suggested fix</span>
                <span class="drawer-arrow" style="font-size:0.75rem; transition:transform 0.2s;">▾ Expand</span>
              </button>

              <div class="dtc-drawer-content" style="display:none; margin-top:0.65rem; background:rgba(0,0,0,0.22); border-radius:6px; padding:0.85rem; border:1px solid rgba(255,255,255,0.05);">
                <div style="margin-bottom:0.75rem;">
                  <strong style="font-size:0.82rem; color:var(--primary); display:flex; align-items:center; gap:0.3rem;">
                    <span>📖</span> <span>What This Means:</span>
                  </strong>
                  <p style="font-size:0.82rem; color:var(--text-main); line-height:1.45; margin:4px 0 0 0;">
                    ${dtc.meaning || 'Electronic control module detected operating parameters outside calibrated threshold.'}
                  </p>
                </div>

                ${dtc.causes && dtc.causes.length > 0 ? `
                  <div style="margin-bottom:0.75rem;">
                    <strong style="font-size:0.82rem; color:#f59e0b; display:flex; align-items:center; gap:0.3rem;">
                      <span>🔍</span> <span>Common Root Causes:</span>
                    </strong>
                    <ul style="margin:4px 0 0 1.25rem; padding:0; font-size:0.8rem; color:var(--text-main); line-height:1.45;">
                      ${dtc.causes.map(c => `<li>${c}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}

                ${dtc.fixes && dtc.fixes.length > 0 ? `
                  <div>
                    <strong style="font-size:0.82rem; color:var(--success); display:flex; align-items:center; gap:0.3rem;">
                      <span>🛠️</span> <span>Suggested Action & Fixes:</span>
                    </strong>
                    <ul style="margin:4px 0 0 1.25rem; padding:0; font-size:0.8rem; color:var(--text-main); line-height:1.45;">
                      ${dtc.fixes.map(f => `<li>${f}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}

                <div style="margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid rgba(255,255,255,0.06); font-size:0.72rem; color:var(--text-muted); font-style:italic;">
                  ⚠️ Workshop Advice: Always disconnect vehicle battery negative terminal before servicing SRS airbag or high-voltage circuits.
                </div>
              </div>
            </div>
          `;
        });
        bodyHtml += '</div>';
      }

      modCard.innerHTML = headerHtml + bodyHtml;
      container.appendChild(modCard);
    });

    // Wire up drawer toggle buttons
    container.querySelectorAll('.dtc-drawer-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const drawer = btn.nextElementSibling;
        const arrow = btn.querySelector('.drawer-arrow');
        if (!drawer) return;
        const isHidden = drawer.style.display === 'none';
        drawer.style.display = isHidden ? 'block' : 'none';
        if (arrow) arrow.textContent = isHidden ? '▴ Collapse' : '▾ Expand';
        btn.style.background = isHidden ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.08)';
      });
    });

    // Wire up single-module clear buttons
    container.querySelectorAll('.btn-clear-mod').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const modAddr = btn.getAttribute('data-mod');
        if (!modAddr) return;
        if (confirm(`Clear diagnostic trouble codes stored in Address ${modAddr}?`)) {
          await this.clearSingleModuleDTCs(modAddr);
        }
      });
    });
  }

  async clearSingleModuleDTCs(moduleHex) {
    const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);
    try {
      if (isConnected) {
        await this.udsClient.clearModuleDTCs(moduleHex);
      }
      // Update in-memory results
      if (this.lastDtcScanResults && this.lastDtcScanResults.modules) {
        const mod = this.lastDtcScanResults.modules.find(m => m.address.toLowerCase() === moduleHex.toLowerCase());
        if (mod) mod.dtcs = [];
        this.renderDtcsList(this.lastDtcScanResults);
      }
      this.showToast(`Cleared fault codes for Address ${moduleHex}`);
      this.vibrate([30, 30]);
    } catch (err) {
      alert(`Failed to clear module ${moduleHex}: ` + (err.message || err));
    }
  }

  async clearAllDtcFaults() {
    if (!confirm('Clear all Diagnostic Trouble Codes across all vehicle control units? This will clear active fault memories and reset emission readiness.')) {
      return;
    }

    const isConnected = !!(this.bleTransport && this.bleTransport.isConnected);
    const clearBtn = document.getElementById('btn-clear-dtcs');
    if (clearBtn) {
      clearBtn.disabled = true;
      clearBtn.textContent = 'Clearing...';
    }

    try {
      if (isConnected && this.lastDtcScanResults && this.lastDtcScanResults.modules) {
        for (const mod of this.lastDtcScanResults.modules) {
          if (mod.dtcs && mod.dtcs.length > 0) {
            await this.udsClient.clearModuleDTCs(mod.address);
          }
        }
      }

      // Reset in-memory results
      if (this.lastDtcScanResults && this.lastDtcScanResults.modules) {
        this.lastDtcScanResults.modules.forEach(m => m.dtcs = []);
        this.lastDtcScanResults.totalDtcCount = 0;
      }

      this.renderDtcsList(this.lastDtcScanResults);
      this.updateCockpitDtcAlert([]);
      this.showToast('✅ All Diagnostic Trouble Codes cleared successfully.');
      this.vibrate([50, 50]);
    } catch (err) {
      alert('Failed to clear DTCs: ' + (err.message || err));
    } finally {
      if (clearBtn) {
        clearBtn.disabled = false;
        clearBtn.innerHTML = '<span>🗑️</span> <span>Clear All</span>';
      }
    }
  }

  exportDtcScanReport() {
    if (!this.lastDtcScanResults || !this.lastDtcScanResults.modules) {
      alert('Please run a diagnostic scan before exporting a report.');
      return;
    }

    const res = this.lastDtcScanResults;
    const dateStr = new Date(res.timestamp || Date.now()).toLocaleString();
    const vinStr = this.vin || 'VIN Not Read';

    let report = `====================================================\n`;
    report += `vibesODB2 Vehicle Diagnostic Auto-Scan Report\n`;
    report += `Generated: ${dateStr}\n`;
    report += `Vehicle VIN: ${vinStr}\n`;
    report += `Status: ${res.totalDtcCount || 0} Faults Detected across ${res.modules.length} Modules\n`;
    report += `====================================================\n\n`;

    res.modules.forEach(mod => {
      const faultCount = mod.dtcs ? mod.dtcs.length : 0;
      report += `[ Address ${mod.address}: ${mod.name} ] (${faultCount} Fault${faultCount === 1 ? '' : 's'})\n`;
      report += `Part No: ${mod.partNumber || 'N/A'} | Component: ${mod.component || 'VAG ECU'}\n`;
      if (mod.coding) report += `Coding: ${mod.coding}\n`;
      report += `Protocol: ${mod.protocol || 'ISO 15765'}\n`;

      if (faultCount === 0) {
        report += `Status: ✅ No Faults Stored (Nominal)\n\n`;
      } else {
        mod.dtcs.forEach(dtc => {
          report += `  - Code: ${dtc.code} - ${dtc.title}\n`;
          if (dtc.symptom) report += `    Symptom: ${dtc.symptom}\n`;
          report += `    Status: ${dtc.isStatic ? 'Static / Active' : 'Intermittent'}\n`;
          if (dtc.meaning) report += `    What It Means: ${dtc.meaning}\n`;
          if (dtc.causes && dtc.causes.length > 0) {
            report += `    Common Causes:\n`;
            dtc.causes.forEach(c => report += `      * ${c}\n`);
          }
          if (dtc.fixes && dtc.fixes.length > 0) {
            report += `    Suggested Fixes:\n`;
            dtc.fixes.forEach(f => report += `      * ${f}\n`);
          }
          report += `\n`;
        });
      }
    });

    report += `====================================================\n`;
    report += `Generated by vibesODB2 • https://orviwan.github.io/vibesODB2/\n`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        this.showToast('📋 Diagnostic Report copied to clipboard!');
      }).catch(() => {
        alert(report);
      });
    } else {
      alert(report);
    }
  }
}

// Instantiate and launch
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const app = new VibesApp();
    app.init();
    window.__VIBES_APP__ = app;
    window.app = app;
  });
}
