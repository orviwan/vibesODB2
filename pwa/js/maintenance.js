// vibesODB2 Service Tab Controller
//
// Only the standardised OBD-II odometer PID (SAE J1979 Mode 01 PID A6) is offered here.
// Earlier versions shipped service-interval resets, battery registration, parking-brake
// routines and one-click adaptations that wrote to manufacturer-specific identifiers whose
// meaning had not been verified on any vehicle, with no interlocks. They were removed
// deliberately; see docs/REMOVED_FEATURES.md for the verification bar to bring one back.

export class MaintenanceManager {
  constructor({ udsClient, bleTransport, showToast, vibrate, withBusLock }) {
    this.udsClient = udsClient;
    this.bleTransport = bleTransport;
    this.showToast = showToast || console.log;
    this.vibrate = vibrate || (() => {});
    this.withBusLock = withBusLock || ((fn) => fn());
    this.mileageUnit = 'km';
    this.lastOdometerKm = null;
  }

  init() {
    this.setupOdometerListeners();
  }

  setupOdometerListeners() {
    const btnCheck = document.getElementById('btn-check-obd-odometer');
    const resultBox = document.getElementById('odometer-results-box');
    const ecuEl = document.getElementById('val-obd-odometer');
    const dashEl = document.getElementById('val-dash-odometer');
    const diffEl = document.getElementById('val-diff-odometer');
    const noteEl = document.getElementById('val-odometer-note');
    const btnToggleUnit = document.getElementById('btn-toggle-odometer-unit');
    const dashInput = document.getElementById('input-dash-odometer');

    try {
      this.mileageUnit = localStorage.getItem('vibesodb2_mileage_unit') || 'km';
    } catch (e) {}

    const render = () => {
      const isMiles = this.mileageUnit === 'miles';
      const unit = isMiles ? 'mi' : 'km';
      if (btnToggleUnit) btnToggleUnit.textContent = isMiles ? 'Units: Miles' : 'Units: KM';
      if (dashInput) dashInput.placeholder = isMiles ? 'e.g. 53000' : 'e.g. 85400';
      if (this.lastOdometerKm === null) return;

      const ecuDisplay = isMiles ? Math.round(this.lastOdometerKm * 0.621371) : this.lastOdometerKm;
      if (ecuEl) ecuEl.textContent = `${ecuDisplay.toLocaleString()} ${unit}`;

      const dashVal = parseInt(dashInput?.value || '0', 10);
      if (dashVal > 0) {
        const diff = ecuDisplay - dashVal;
        if (dashEl) dashEl.textContent = `${dashVal.toLocaleString()} ${unit}`;
        if (diffEl) diffEl.textContent = `${diff > 0 ? '+' : ''}${diff.toLocaleString()} ${unit}`;
        if (noteEl) {
          // Deliberately neutral: a difference is a prompt to investigate with documented
          // service history, not a verdict about anyone.
          noteEl.textContent = 'The OBD odometer value is reported by the engine control unit and can legitimately differ from the dashboard (unit rounding, replaced modules, cluster replacement). A large difference is a reason to check the vehicle history, not proof of anything by itself.';
        }
      } else {
        if (dashEl) dashEl.textContent = 'Enter the dashboard value above to compare';
        if (diffEl) diffEl.textContent = '--';
        if (noteEl) noteEl.textContent = '';
      }
    };

    btnToggleUnit?.addEventListener('click', () => {
      this.mileageUnit = this.mileageUnit === 'miles' ? 'km' : 'miles';
      try { localStorage.setItem('vibesodb2_mileage_unit', this.mileageUnit); } catch (e) {}
      render();
    });
    dashInput?.addEventListener('input', render);
    render();

    btnCheck?.addEventListener('click', async () => {
      if (!this.bleTransport.isConnected) {
        alert('Please connect your Bluetooth OBD-II adapter first.');
        return;
      }
      btnCheck.disabled = true;
      const orig = btnCheck.textContent;
      btnCheck.textContent = 'Querying...';
      try {
        const km = await this.withBusLock(() => this.udsClient.readObdOdometerKm());
        this.lastOdometerKm = km;
        if (resultBox) resultBox.style.display = 'block';
        if (km !== null && km > 0) {
          render();
          this.showToast('OBD odometer read successfully.');
        } else {
          if (ecuEl) ecuEl.textContent = 'Not supported by this engine control unit';
          if (noteEl) noteEl.textContent = 'PID A6 is optional in SAE J1979; many pre-2018 VAG engine ECUs do not implement it.';
        }
      } catch (err) {
        alert('Could not read OBD odometer: ' + (err.message || err));
      } finally {
        btnCheck.disabled = false;
        btnCheck.textContent = orig;
      }
    });
  }
}
