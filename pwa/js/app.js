// vibesODB2 Progressive Web Application Controller
import { BUNDLED_SCHEMAS, computeByteDiff, hexStringToBytes, bytesToHexString } from './schemas.js';
import { saveBackup, getBackups, getBackupById, exportBackupsJson, importBackupsJson } from './storage.js';
import { WebBleTransport } from './ble.js';
import { UdsClient } from './uds.js';
import { SafetyPipeline, BLACKLISTED_MODULES } from './safety.js';
import { TelemetryEngine } from './telemetry.js';

// --- State Management ---
class VibesApp {
  constructor() {
    this.unit = 'kmh'; // 'kmh' | 'mph'
    this.selectedSchemaKey = 'pq25_bcm_0x09';
    this.currentSchema = BUNDLED_SCHEMAS[this.selectedSchemaKey];
    this.selectedByteIndex = 0;
    this.vin = 'WV2ZZZ7HZCH019482'; // Realistic Transporter T5.1 baseline VIN

    // Default 30-byte baseline coding for PQ25 BCM 0x09
    this.baselineHex = '68B80BB8E021340080080000282B84D40880410F60804000000000000000';
    this.currentBytes = hexStringToBytes(this.baselineHex);

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

  // --- Web Bluetooth Connection ---
  setupBluetooth() {
    const bleBtn = document.getElementById('btn-ble-connect');
    if (!bleBtn) return;

    bleBtn.addEventListener('click', async () => {
      if (this.bleTransport.isConnected) {
        // Disconnect
        await this.bleTransport.disconnect();
        this.telemetryEngine.stop();
        this.updateConnectionStatus(false);
      } else {
        // Request Web Bluetooth Device
        try {
          bleBtn.textContent = 'Connecting...';
          const success = await this.bleTransport.connect();
          if (success) {
            this.updateConnectionStatus(true);
            this.telemetryEngine.start();
            this.vibrate([50, 50, 50]);
          } else {
            this.updateConnectionStatus(false);
          }
        } catch (err) {
          console.error('BLE connection failed:', err);
          alert('Bluetooth connection cancelled or failed: ' + (err.message || err));
          this.updateConnectionStatus(false);
        }
      }
    });
  }

  updateConnectionStatus(connected) {
    const bleBtn = document.getElementById('btn-ble-connect');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const noticeEl = document.getElementById('cockpit-ble-notice');

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
      if (noticeEl) {
        noticeEl.style.display = 'none';
      }
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
      if (noticeEl) {
        noticeEl.style.display = 'block';
      }
    }
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
      const speedVal = this.unit === 'mph' 
        ? Math.round(data.vehicle_speed_kmh * 0.621371) 
        : Math.round(data.vehicle_speed_kmh);
      speedEl.textContent = speedVal;
    }

    // 2. RPM & Arc
    const rpmEl = document.getElementById('gauge-rpm-val');
    const rpm = Math.max(0, Math.min(6000, data.engine_rpm || 0));
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
    const currentGear = data.engaged_gear || data.gear;
    if (gearEl && currentGear) {
      gearEl.textContent = currentGear;
    }

    // 4. Boost Pressure
    const boostValEl = document.getElementById('metric-boost-val');
    const boostBarEl = document.getElementById('progress-boost');
    if (boostValEl) boostValEl.textContent = `${(data.boost_pressure_bar || 0).toFixed(2)} bar`;
    if (boostBarEl) {
      const pct = Math.min(100, Math.max(0, ((data.boost_pressure_bar || 0) / 2.0) * 100));
      boostBarEl.style.width = `${pct}%`;
    }

    // 5. Coolant Temp
    const coolantValEl = document.getElementById('metric-coolant-val');
    const coolantBarEl = document.getElementById('progress-coolant');
    if (coolantValEl) coolantValEl.textContent = `${Math.round(data.coolant_temp_c || 85)} °C`;
    if (coolantBarEl) {
      const pct = Math.min(100, Math.max(0, (((data.coolant_temp_c || 85) - 40) / 80) * 100));
      coolantBarEl.style.width = `${pct}%`;
      if ((data.coolant_temp_c || 85) >= 105) {
        coolantBarEl.style.background = '#ef4444';
      } else {
        coolantBarEl.style.background = '';
      }
    }

    // 6. Intake Air Temp (IAT)
    const iatEl = document.getElementById('metric-iat-val');
    if (iatEl) iatEl.textContent = `${Math.round(data.intake_air_temp_c || 24)} °C`;

    // 7. Exhaust Gas Temp (EGT)
    const egtEl = document.getElementById('metric-egt-val');
    const egtVal = data.exhaust_gas_temp_c !== undefined ? data.exhaust_gas_temp_c : data.egt_c;
    if (egtEl) egtEl.textContent = `${Math.round(egtVal || 280)} °C`;

    // 8. DPF Soot Load
    const sootValEl = document.getElementById('metric-soot-val');
    const sootBarEl = document.getElementById('progress-soot');
    if (sootValEl) sootValEl.textContent = `${(data.dpf_soot_load_g || 18.4).toFixed(1)} g`;
    if (sootBarEl) {
      const pct = Math.min(100, Math.max(0, ((data.dpf_soot_load_g || 18.4) / 45.0) * 100));
      sootBarEl.style.width = `${pct}%`;
    }

    // 9. Throttle Position
    const throttleEl = document.getElementById('metric-throttle-val');
    if (throttleEl) throttleEl.textContent = `${Math.round(data.throttle_position_pct || 0)}%`;
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

      const item = document.createElement('div');
      item.className = 'feature-item';

      const info = document.createElement('div');
      info.className = 'feature-info';
      info.innerHTML = `
        <h4>${feat.name}</h4>
        <p>${feat.description || ''}</p>
        <span style="font-size: 0.72rem; color: #64748b; font-family: var(--font-mono)">
          [Byte ${feat.byte}, Bit ${feat.bit}] ${feat.prerequisites ? '• ' + feat.prerequisites : ''}
        </span>
      `;

      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'toggle-switch';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = isEnabled;

      const slider = document.createElement('span');
      slider.className = 'slider';

      checkbox.addEventListener('change', () => {
        // Clone current bytes
        const modifiedBytes = new Uint8Array(this.currentBytes);
        if (checkbox.checked) {
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
            this.renderByteGrid();
            this.renderBitSwitches();
            this.vibrate([40, 20, 40]);
          },
          onCancel: () => {
            checkbox.checked = !checkbox.checked; // revert
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

    for (let bit = 7; bit >= 0; bit--) {
      const isBitSet = (currentVal & (1 << bit)) !== 0;
      const btn = document.createElement('button');
      btn.className = `bit-btn ${isBitSet ? 'active' : ''}`;
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
          <button class="btn btn-secondary" style="font-size:0.75rem; padding:4px 8px;" id="btn-restore-${b.id}">Restore</button>
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
