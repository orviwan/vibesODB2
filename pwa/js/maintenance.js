// vibesODB2 Service & Maintenance Tools Controller

export class MaintenanceManager {
  constructor({ udsClient, bleTransport, showToast, vibrate }) {
    this.udsClient = udsClient;
    this.bleTransport = bleTransport;
    this.showToast = showToast || console.log;
    this.vibrate = vibrate || (() => {});
  }

  init() {
    this.setupSriListeners();
    this.setupBatteryListeners();
    this.setupEpbListeners();
    this.setupMileageListeners();
    this.setupAdaptationsListeners();
  }

  // --- 1. Service Reminder Reset (SRI) ---
  setupSriListeners() {
    const btnOil = document.getElementById('btn-reset-oil-service');
    const btnInsp = document.getElementById('btn-reset-insp-service');
    const statusEl = document.getElementById('sri-status-msg');

    if (btnOil) {
      btnOil.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Please connect your Bluetooth OBD-II adapter first.');
          return;
        }

        if (!confirm('Reset Oil Service Interval? This will set distance and days since last oil service to 0.')) {
          return;
        }

        btnOil.disabled = true;
        btnOil.textContent = 'Resetting Oil Interval...';
        if (statusEl) statusEl.textContent = 'Communicating with Instrument Cluster (0x17)...';

        try {
          const ok = await this.udsClient.resetOilService();
          this.vibrate([40, 40]);
          if (statusEl) {
            statusEl.textContent = '✅ Oil Service Reminder successfully reset to 0 km / 0 days.';
            statusEl.style.color = '#34d399';
          }
          this.showToast('✅ Oil Service Reminder reset successfully!');
        } catch (err) {
          console.error('Oil reset error:', err);
          if (statusEl) {
            statusEl.textContent = '❌ Oil service reset failed: ' + (err.message || err);
            statusEl.style.color = '#f87171';
          }
          alert('Failed to reset oil service: ' + (err.message || err));
        } finally {
          btnOil.disabled = false;
          btnOil.textContent = '🔄 Reset Oil Service (0 km / 0 days)';
        }
      });
    }

    if (btnInsp) {
      btnInsp.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Please connect your Bluetooth OBD-II adapter first.');
          return;
        }

        const kmVal = parseInt(document.getElementById('sri-insp-km')?.value || '15000', 10);
        const daysVal = parseInt(document.getElementById('sri-insp-days')?.value || '365', 10);

        if (!confirm(`Reset Inspection Service Interval to ${kmVal.toLocaleString()} km / ${daysVal} days?`)) {
          return;
        }

        btnInsp.disabled = true;
        btnInsp.textContent = 'Resetting Inspection...';
        if (statusEl) statusEl.textContent = 'Writing inspection thresholds to Instrument Cluster (0x17)...';

        try {
          const ok = await this.udsClient.resetInspectionService(kmVal, daysVal);
          this.vibrate([40, 40]);
          if (statusEl) {
            statusEl.textContent = `✅ Inspection Service successfully reset (${kmVal.toLocaleString()} km / ${daysVal} days).`;
            statusEl.style.color = '#34d399';
          }
          this.showToast('✅ Inspection Service interval reset successfully!');
        } catch (err) {
          console.error('Inspection reset error:', err);
          if (statusEl) {
            statusEl.textContent = '❌ Inspection reset failed: ' + (err.message || err);
            statusEl.style.color = '#f87171';
          }
          alert('Failed to reset inspection service: ' + (err.message || err));
        } finally {
          btnInsp.disabled = false;
          btnInsp.textContent = '🔄 Reset Inspection Interval';
        }
      });
    }
  }

  // --- 2. 12V Battery Registration & Coding ---
  setupBatteryListeners() {
    const btnRead = document.getElementById('btn-read-battery');
    const btnApply = document.getElementById('btn-apply-battery');
    const statusEl = document.getElementById('battery-status-msg');

    if (btnRead) {
      btnRead.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Please connect your Bluetooth OBD-II adapter first.');
          return;
        }

        btnRead.disabled = true;
        btnRead.textContent = 'Reading Gateway...';
        try {
          const cfg = await this.udsClient.readBatteryConfig();
          const capInput = document.getElementById('battery-capacity');
          const techSelect = document.getElementById('battery-tech');
          const vendorInput = document.getElementById('battery-vendor');
          const serialInput = document.getElementById('battery-serial');

          if (capInput && cfg.capacityAh) capInput.value = cfg.capacityAh;
          if (techSelect && cfg.tech) techSelect.value = cfg.tech;
          if (vendorInput && cfg.vendor) vendorInput.value = cfg.vendor;
          if (serialInput && cfg.serial) serialInput.value = cfg.serial;

          if (statusEl) {
            statusEl.textContent = `✅ Active Battery Loaded: ${cfg.capacityAh}Ah ${cfg.tech} (${cfg.vendor} #${cfg.serial})`;
            statusEl.style.color = '#34d399';
          }
          this.showToast('Battery registration parameters loaded from Gateway.');
        } catch (err) {
          if (statusEl) {
            statusEl.textContent = 'Could not read existing battery parameters: ' + (err.message || err);
            statusEl.style.color = '#fbbf24';
          }
        } finally {
          btnRead.disabled = false;
          btnRead.textContent = '🔍 Read Active Battery from Gateway';
        }
      });
    }

    if (btnApply) {
      btnApply.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Please connect your Bluetooth OBD-II adapter first.');
          return;
        }

        const capacityAh = parseInt(document.getElementById('battery-capacity')?.value || '70', 10);
        const tech = document.getElementById('battery-tech')?.value || 'AGM';
        const vendor = (document.getElementById('battery-vendor')?.value || 'JCB').trim().toUpperCase();
        let serial = (document.getElementById('battery-serial')?.value || '1111111111').trim();

        if (serial.length < 10) {
          serial = serial.padEnd(10, '0');
        }

        if (!confirm(`Register New Battery to CAN Gateway (0x19)?\n\n- Capacity: ${capacityAh} Ah\n- Technology: ${tech}\n- Vendor: ${vendor}\n- Serial: ${serial}\n\nThis will recalibrate the alternator battery management charging profile.`)) {
          return;
        }

        btnApply.disabled = true;
        btnApply.textContent = 'Writing to Gateway (0x19)...';
        if (statusEl) statusEl.textContent = 'Programming battery adaptation channels...';

        try {
          await this.udsClient.writeBatteryConfig({ capacityAh, tech, vendor, serial });
          this.vibrate([50, 50]);
          if (statusEl) {
            statusEl.textContent = `✅ New Battery Successfully Registered: ${capacityAh}Ah ${tech} [${vendor} #${serial}]`;
            statusEl.style.color = '#34d399';
          }
          this.showToast('🛡️ Battery successfully registered! Alternator charging curves updated.');
        } catch (err) {
          console.error('Battery write error:', err);
          if (statusEl) {
            statusEl.textContent = '❌ Battery registration failed: ' + (err.message || err);
            statusEl.style.color = '#f87171';
          }
          alert('Failed to register battery: ' + (err.message || err));
        } finally {
          btnApply.disabled = false;
          btnApply.textContent = '⚡ Register New Battery';
        }
      });
    }
  }

  // --- 3. Electronic Parking Brake (EPB) Service Mode ---
  setupEpbListeners() {
    const btnOpen = document.getElementById('btn-epb-open');
    const btnClose = document.getElementById('btn-epb-close');
    const statusEl = document.getElementById('epb-status-msg');

    if (btnOpen) {
      btnOpen.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Please connect your Bluetooth OBD-II adapter first.');
          return;
        }

        const msg = "⚠️ SAFETY CHECK FOR BRAKE SERVICE:\n\n" +
          "1. Ensure vehicle is on LEVEL GROUND with wheel chocks in place.\n" +
          "2. Ignition ON, Engine OFF.\n" +
          "3. Release the parking brake switch first.\n\n" +
          "Retract electric rear brake calipers to Service Position for pad replacement?";

        if (!confirm(msg)) return;

        btnOpen.disabled = true;
        btnOpen.textContent = 'Opening Calipers... (Listen for motor sound)';
        if (statusEl) statusEl.textContent = 'Retracting electric parking brake motors...';

        try {
          await this.udsClient.openEpbCalipers();
          this.vibrate([60, 60]);
          if (statusEl) {
            statusEl.textContent = '🟢 EPB Service Mode ACTIVE: Rear calipers retracted. Safe to replace brake pads.';
            statusEl.style.color = '#34d399';
          }
          this.showToast('🟢 EPB Calipers opened to service position.');
        } catch (err) {
          console.error('EPB open error:', err);
          if (statusEl) {
            statusEl.textContent = '❌ Caliper retraction command sent. Verify caliper state.';
            statusEl.style.color = '#fbbf24';
          }
        } finally {
          btnOpen.disabled = false;
          btnOpen.textContent = '🔓 Open Calipers (Pad Replacement Mode)';
        }
      });
    }

    if (btnClose) {
      btnClose.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Please connect your Bluetooth OBD-II adapter first.');
          return;
        }

        if (!confirm('Close rear brake calipers and perform clamping calibration test? Ensure new brake pads and wheels are installed!')) {
          return;
        }

        btnClose.disabled = true;
        btnClose.textContent = 'Closing Calipers... (Calibrating)';
        if (statusEl) statusEl.textContent = 'Closing parking brake calipers and checking basic settings...';

        try {
          await this.udsClient.closeEpbCalipers();
          this.vibrate([50, 50]);
          if (statusEl) {
            statusEl.textContent = '✅ EPB Normal Mode Restored: Calipers closed and calibrated.';
            statusEl.style.color = '#34d399';
          }
          this.showToast('✅ EPB Calipers closed and calibrated successfully.');
        } catch (err) {
          console.error('EPB close error:', err);
          if (statusEl) {
            statusEl.textContent = '❌ Caliper closure command sent. Pump foot brake before driving.';
            statusEl.style.color = '#fbbf24';
          }
        } finally {
          btnClose.disabled = false;
          btnClose.textContent = '🔒 Close Calipers (Normal Mode & Calibrate)';
        }
      });
    }
  }

  // --- 4. ECU True Mileage Checker (Anti-Fraud Inspection) ---
  setupMileageListeners() {
    const btnCheck = document.getElementById('btn-check-ecu-mileage');
    const resultBox = document.getElementById('mileage-results-box');
    const ecuKmEl = document.getElementById('val-ecu-mileage');
    const dashKmEl = document.getElementById('val-dash-mileage');
    const diffKmEl = document.getElementById('val-diff-mileage');
    const verdictEl = document.getElementById('val-mileage-verdict');

    if (btnCheck) {
      btnCheck.addEventListener('click', async () => {
        if (!this.bleTransport.isConnected) {
          alert('Please connect your Bluetooth OBD-II adapter first.');
          return;
        }

        btnCheck.disabled = true;
        btnCheck.textContent = 'Querying Engine ECU...';

        try {
          const ecuMileage = await this.udsClient.readEcuMileage();
          const dashInput = document.getElementById('input-dash-mileage');
          const dashMileage = parseInt(dashInput?.value || '0', 10);

          if (resultBox) resultBox.style.display = 'block';

          if (ecuMileage !== null && ecuMileage > 0) {
            if (ecuKmEl) ecuKmEl.textContent = `${ecuMileage.toLocaleString()} km (${Math.round(ecuMileage * 0.621371).toLocaleString()} mi)`;

            if (dashMileage > 0) {
              if (dashKmEl) dashKmEl.textContent = `${dashMileage.toLocaleString()} km`;
              const diff = Math.abs(ecuMileage - dashMileage);
              const pctDiff = (diff / Math.max(ecuMileage, dashMileage)) * 100;

              if (diffKmEl) diffKmEl.textContent = `${diff.toLocaleString()} km (${pctDiff.toFixed(1)}%)`;

              if (verdictEl) {
                if (pctDiff <= 5.0) {
                  verdictEl.textContent = '✅ Authentic Mileage: Engine ECU and Dashboard match within normal tolerance.';
                  verdictEl.style.color = '#34d399';
                } else if (ecuMileage > dashMileage) {
                  verdictEl.textContent = `🚨 MILEAGE TAMPERING SUSPECTED: Engine ECU records ${diff.toLocaleString()} km MORE than odometer display!`;
                  verdictEl.style.color = '#f87171';
                } else {
                  verdictEl.textContent = `⚠️ Discrepancy detected: Engine ECU and Dashboard differ by ${diff.toLocaleString()} km.`;
                  verdictEl.style.color = '#fbbf24';
                }
              }
            } else {
              if (dashKmEl) dashKmEl.textContent = 'Enter dash value above to compare';
              if (verdictEl) {
                verdictEl.textContent = `✅ Engine ECU Odometer Logged: ${ecuMileage.toLocaleString()} km.`;
                verdictEl.style.color = '#34d399';
              }
            }
            this.showToast(`Engine ECU true mileage: ${ecuMileage.toLocaleString()} km`);
          } else {
            if (ecuKmEl) ecuKmEl.textContent = 'Not exposed via standard UDS on this engine variant';
            if (verdictEl) {
              verdictEl.textContent = 'ℹ️ Engine ECU did not return secondary odometer data. Typical on some petrol ECUs.';
              verdictEl.style.color = '#94a3b8';
            }
          }
        } catch (err) {
          console.error('Mileage check error:', err);
          alert('Could not query Engine ECU mileage: ' + (err.message || err));
        } finally {
          btnCheck.disabled = false;
          btnCheck.textContent = '🔍 Query True Engine ECU Mileage';
        }
      });
    }
  }

  // --- 5. Preset One-Click Adaptations ---
  setupAdaptationsListeners() {
    const btnBlinks = document.getElementById('btn-apply-comfort-blinks');
    const btnLock = document.getElementById('btn-apply-acoustic-lock');
    const btnSs = document.getElementById('btn-apply-start-stop');
    const btnWipe = document.getElementById('btn-apply-teardrop-wipe');
    const adaptStatus = document.getElementById('adapt-status-msg');

    const runAdaptation = async (btn, name, actionFn) => {
      if (!this.bleTransport.isConnected) {
        alert('Please connect your Bluetooth OBD-II adapter first.');
        return;
      }

      btn.disabled = true;
      const origText = btn.textContent;
      btn.textContent = 'Applying...';
      if (adaptStatus) adaptStatus.textContent = `Writing adaptation "${name}" to module...`;

      try {
        await actionFn();
        this.vibrate([40, 40]);
        if (adaptStatus) {
          adaptStatus.textContent = `✅ Adaptation "${name}" applied successfully!`;
          adaptStatus.style.color = '#34d399';
        }
        this.showToast(`✅ "${name}" adaptation updated.`);
      } catch (err) {
        console.error(`Adaptation ${name} error:`, err);
        if (adaptStatus) {
          adaptStatus.textContent = `❌ Failed to apply "${name}": ` + (err.message || err);
          adaptStatus.style.color = '#f87171';
        }
        alert(`Failed to apply "${name}": ` + (err.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    };

    if (btnBlinks) {
      btnBlinks.addEventListener('click', () => {
        const blinks = parseInt(document.getElementById('select-comfort-blinks')?.value || '3', 10);
        runAdaptation(btnBlinks, `Comfort Turn Signals (${blinks} Blinks)`, async () => {
          await this.udsClient.setTargetModule('0x09'); // BCM
          await this.udsClient.enterExtendedSession();
          await this.udsClient.securityAccess('31347');
          // DID 0x0745: Comfort signal cycle count
          await this.udsClient.writeDataById('0745', [blinks]);
        });
      });
    }

    if (btnLock) {
      btnLock.addEventListener('click', () => {
        const val = document.getElementById('select-acoustic-lock')?.value === '1';
        runAdaptation(btnLock, `Acoustic Lock Horn Beep (${val ? 'ON' : 'OFF'})`, async () => {
          await this.udsClient.setTargetModule('0x09'); // BCM
          await this.udsClient.enterExtendedSession();
          await this.udsClient.securityAccess('31347');
          // DID 0x08C6: Acoustic confirmation
          await this.udsClient.writeDataById('08C6', [val ? 0x01 : 0x00]);
        });
      });
    }

    if (btnSs) {
      btnSs.addEventListener('click', () => {
        const disable = document.getElementById('select-start-stop')?.value === 'disable';
        runAdaptation(btnSs, `Start/Stop System (${disable ? 'Disabled' : 'Enabled'})`, async () => {
          await this.udsClient.setTargetModule('0x19'); // Gateway
          await this.udsClient.enterExtendedSession();
          await this.udsClient.securityAccess('20103');
          // Voltage limit threshold: standard 7.6V (0x4C) vs disabled 12.1V (0x79)
          const limitByte = disable ? 0x79 : 0x4C;
          await this.udsClient.writeDataById('003E', [limitByte]);
        });
      });
    }

    if (btnWipe) {
      btnWipe.addEventListener('click', () => {
        const val = document.getElementById('select-teardrop-wipe')?.value === '1';
        runAdaptation(btnWipe, `Teardrop Wiper Wipe (${val ? 'Active' : 'Disabled'})`, async () => {
          await this.udsClient.setTargetModule('0x09'); // BCM
          await this.udsClient.enterExtendedSession();
          await this.udsClient.securityAccess('31347');
          await this.udsClient.writeDataById('091F', [val ? 0x01 : 0x00]);
        });
      });
    }
  }
}
