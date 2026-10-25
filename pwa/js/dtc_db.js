// vibesODB2 - VAG & SAE Diagnostic Trouble Code (DTC) Decoder & Reference Database
// Decodes ISO 15031-6 / SAE J2012-DA codes, ISO 14229-1 Failure Type Bytes (FTB),
// and KWP2000 5-digit VAG fault codes + symptom bytes.
//
// PROVENANCE POLICY (see CONTRIBUTING.md)
// Fault-code numbers and symptom/failure-type byte values are facts. All explanatory prose in
// this module and pwa/data/dtcs.json is written in original wording for vibesODB2. Entries are
// general reference guidance, not a diagnosis of any specific vehicle. Unlisted codes are shown
// honestly with their structural byte decode rather than generic filler causes/fixes.

/**
 * VAG KWP2000 Symptom Bytes (lower 7 bits; bit 7 0x80 indicates intermittent/sporadic)
 */
export const VAG_SYMPTOM_CODES = {
  '000': { label: 'No Additional Symptom Subtype', description: 'Controller recorded the fault without a secondary symptom qualifier.' },
  '001': { label: 'Upper Limit Exceeded', description: 'Measured signal rose above the calibrated upper threshold.' },
  '002': { label: 'Lower Limit Exceeded', description: 'Measured signal fell below the calibrated lower threshold.' },
  '003': { label: 'Mechanical Failure', description: 'Actuator, valve, or mechanical linkage jammed, slipped, or failed to move.' },
  '004': { label: 'No Signal / Communication', description: 'Expected electrical pulses or bus frames were not received.' },
  '005': { label: 'Basic Setting Not Performed / Incorrect', description: 'Component requires zero-point or end-stop calibration.' },
  '006': { label: 'Short Circuit to Plus (+)', description: 'Circuit is shorted to battery or reference positive voltage.' },
  '007': { label: 'Short Circuit to Ground (-)', description: 'Circuit is shorted to chassis earth.' },
  '008': { label: 'Implausible Signal', description: 'Signal reading conflicts with cross-checked sensors or physical operating state.' },
  '009': { label: 'Open Circuit or Short to Plus', description: 'Conductor is broken/unplugged or pulled up to positive supply.' },
  '010': { label: 'Open Circuit or Short to Ground', description: 'Conductor is broken/unplugged or shorted to chassis ground.' },
  '011': { label: 'Open Circuit', description: 'Electrical path is interrupted (unplugged connector, blown fuse, or broken wire).' },
  '012': { label: 'Electrical Fault in Circuit', description: 'General electrical load, current, or impedance fault detected on the circuit.' },
  '013': { label: 'Check DTC Memory of Companion Module', description: 'Knock-on flag: read fault memory in the referenced control module for the primary cause.' },
  '014': { label: 'Defective / Internal Fault', description: 'Control unit or smart sensor failed an internal self-check.' },
  '016': { label: 'Signal Outside Tolerance', description: 'Measured parameter drifted outside normal regulation window.' },
  '027': { label: 'Implausible Signal', description: 'Inconsistent value received across sensor or databus.' },
  '028': { label: 'Short to Plus (+)', description: 'Line shorted to positive supply.' },
  '029': { label: 'Short to Ground (-)', description: 'Line shorted to chassis ground.' },
  '030': { label: 'Open or Short to Plus', description: 'Circuit open or pulled to battery voltage.' },
  '031': { label: 'Open or Short to Ground', description: 'Circuit open or shorted to ground.' },
  '032': { label: 'Resistance Too High', description: 'Circuit resistance exceeds maximum limit (loose pin, tarnished contact, or open squib).' },
  '033': { label: 'Resistance Too Low', description: 'Circuit resistance is below minimum limit (shorted winding or pinched harness).' },
  '035': { label: 'Open Circuit', description: 'Complete circuit interruption.' },
  '037': { label: 'Defective', description: 'Internal component hardware failure.' },
  '049': { label: 'No Communications', description: 'Target module or LIN slave did not respond on the bus.' }
};

/**
 * Standard ISO 14229-1 / SAE J2012-DA Failure Type Bytes (3rd byte of a 24-bit UDS SAE DTC)
 */
export const UDS_FTB_CODES = {
  0x00: { label: 'No Subtype Information', description: 'No additional failure subtype byte specified by the controller.' },
  0x01: { label: 'General Electrical Failure', description: 'General electrical fault detected on the monitored circuit.' },
  0x02: { label: 'General Signal Failure', description: 'Signal waveform or value failed validation checks.' },
  0x04: { label: 'System Internal Failure', description: 'Internal processor, memory, or driver fault inside the unit.' },
  0x05: { label: 'System Programming Failure', description: 'Missing or incompatible software/dataset configuration.' },
  0x07: { label: 'Mechanical Failure', description: 'Actuator or linkage failed to move freely or reach target position.' },
  0x08: { label: 'Bus Signal / Message Failure', description: 'Corrupted, implausible, or missing serial/CAN/LIN message.' },
  0x09: { label: 'Component Failures', description: 'External smart component reported an internal fault.' },
  0x11: { label: 'Circuit Short to Ground', description: 'Signal or control line is shorted to vehicle chassis earth.' },
  0x12: { label: 'Circuit Short to Battery (+)', description: 'Signal or control line is shorted to +12V/5V supply.' },
  0x13: { label: 'Circuit Open', description: 'Electrical disconnection (unplugged connector, broken wire, or blown element).' },
  0x14: { label: 'Circuit Short to Ground or Open', description: 'Line voltage stays at 0V due to either a broken wire or ground short.' },
  0x15: { label: 'Circuit Short to Battery or Open', description: 'Pull-up circuit remains stuck high due to an open wire/unplugged sensor or short to +V.' },
  0x16: { label: 'Circuit Voltage Below Threshold', description: 'Supply or signal voltage sagged below the minimum operating limit.' },
  0x17: { label: 'Circuit Voltage Above Threshold', description: 'Supply or signal voltage rose above the maximum operating limit.' },
  0x18: { label: 'Circuit Current Below Threshold', description: 'Load draws less current than expected (blown bulb, open coil, or high-resistance contact).' },
  0x19: { label: 'Circuit Current Above Threshold', description: 'Load draws excessive current (shorted load or stalled motor).' },
  0x1A: { label: 'Circuit Resistance Below Threshold', description: 'Measured loop resistance is lower than permitted.' },
  0x1B: { label: 'Circuit Resistance Above Threshold', description: 'Measured loop resistance is higher than permitted (oxidised pin or failing connector).' },
  0x1C: { label: 'Circuit Voltage Out of Range', description: 'Voltage measured outside valid sensor window.' },
  0x1D: { label: 'Circuit Current Out of Range', description: 'Current consumption outside normal load window.' },
  0x1E: { label: 'Circuit Resistance Out of Range', description: 'Impedance outside calibrated limits.' },
  0x1F: { label: 'Circuit Intermittent', description: 'Sporadic electrical make/break contact detected.' },
  0x21: { label: 'Signal Amplitude < Minimum', description: 'Sensor peak-to-peak amplitude is weaker than required.' },
  0x22: { label: 'Signal Amplitude > Maximum', description: 'Sensor amplitude exceeded upper limit.' },
  0x23: { label: 'Signal Stuck Low', description: 'Signal stays clamped near ground and fails to transition.' },
  0x24: { label: 'Signal Stuck High', description: 'Signal stays clamped near upper rail and fails to transition.' },
  0x29: { label: 'Signal Invalid', description: 'Sensor or bus transmitted an explicit invalid/error value.' },
  0x2F: { label: 'Signal Erratic', description: 'Noisy or rapidly jumping signal reading.' },
  0x31: { label: 'No Signal', description: 'Zero pulses or waveform transitions received from sensor.' },
  0x49: { label: 'Internal Electronic Failure', description: 'Hardware fault inside the control module or smart peripheral.' },
  0x54: { label: 'Missing Calibration / Basic Setting', description: 'Zero-point or end-stop adaptation has not been completed.' },
  0x62: { label: 'Signal Compare Failure', description: 'Redundant dual-track sensors disagree with each other.' },
  0x64: { label: 'Signal Plausibility Failure', description: 'Reading is electrically valid but physically impossible given other engine/vehicle sensors.' },
  0x71: { label: 'Actuator Stuck', description: 'Motor, solenoid, or flap failed to move when driven.' },
  0x72: { label: 'Actuator Stuck Open', description: 'Valve or flap could not close to its seat.' },
  0x73: { label: 'Actuator Stuck Closed', description: 'Valve or flap could not open from its seat.' },
  0x81: { label: 'Invalid Serial Data Received', description: 'Companion controller sent an error-flagged value over CAN/LIN.' },
  0x86: { label: 'Signal Invalid on Bus', description: 'Bus signal marked invalid by transmitting ECU.' },
  0x87: { label: 'Missing Message', description: 'Expected periodic CAN or LIN message timed out.' },
  0x96: { label: 'Component Internal Failure', description: 'Sub-component self-diagnostics reported an internal hardware defect.' }
};

/**
 * Seed baseline entries available synchronously prior to async JSON load.
 * Full 325+ code dictionary is merged from pwa/data/dtcs.json via ensureDtcDatabaseLoaded().
 */
export const DTC_KNOWLEDGE_BASE = {
  '01117': {
    code: '01117',
    title: 'Generator Terminal DF Load Signal',
    system: 'Alternator & Charging System',
    meaning: 'Alternator DF load feedback wire to Central Electrics / ECU is open or implausible.',
    causes: [
      'Snapped thin alternator sense wire inside corrugated plastic conduit beneath starter motor / gearbox bracket',
      'Corroded 2-pin alternator DFM/DF plug',
      'Worn alternator voltage regulator'
    ],
    fixes: [
      'Open the corrugated harness sleeve below the starter/gearbox mount and check the thin alternator sense wires for a break',
      'Check 2-pin connector on the back of the alternator and verify ~14.0–14.4V charging voltage at idle'
    ],
    severity: 'warning'
  },
  '01598': {
    code: '01598',
    title: 'Drive Battery Voltage',
    system: 'Battery & Power Supply',
    meaning: 'Supply voltage measured at Central Electrics fell below the lower operating threshold.',
    causes: [
      'Discharged or aged 12V starter battery',
      'Loose battery clamp or corroded chassis ground strap',
      'Alternator undercharging'
    ],
    fixes: [
      'Measure resting battery voltage (>12.4V healthy) and charging voltage (13.8–14.4V)',
      'Clean and tighten battery posts and main gearbox/chassis earth strap'
    ],
    severity: 'warning'
  },
  '00532': {
    code: '00532',
    title: 'Supply Voltage B+',
    system: 'Power Supply',
    meaning: 'Control module detected abnormally low or interrupted battery supply voltage.',
    causes: [
      'Weak 12V battery or cranking voltage dip',
      'Recent battery disconnect during maintenance',
      'Corroded fuse or earth point'
    ],
    fixes: [
      'Test resting battery voltage (>12.4V); if logged during battery work, clear and confirm it does not return'
    ],
    severity: 'warning'
  },
  '00588': {
    code: '00588',
    title: 'Airbag Igniter; Driver Side (N95)',
    system: 'SRS Airbag Safety System',
    meaning: 'Driver steering-wheel airbag squib circuit resistance is outside safe limits.',
    causes: [
      'Broken ribbon inside steering column clockspring / slip ring',
      'Loose yellow SRS connector behind airbag or steering column'
    ],
    fixes: [
      'CAUTION: Disconnect battery negative for 15 minutes before touching SRS wiring; never probe squibs with a multimeter',
      'Inspect yellow slip-ring connectors and replace clockspring if open circuit'
    ],
    severity: 'danger'
  },
  'B104A': {
    code: 'B104A',
    title: 'Rain / Light Recognition Sensor Fault',
    system: 'Central Electrics (LIN Bus)',
    meaning: 'BCM lost LIN communication or detected a circuit fault on the windscreen rain/light sensor (G397).',
    causes: [
      'Rain/light sensor left unplugged behind interior mirror trim after windscreen replacement',
      'Blown fuse feeding mirror/rain sensor',
      'Rain/light sensor enabled in coding on a vehicle without the sensor fitted'
    ],
    fixes: [
      'Inspect 3-pin connector behind rearview mirror trim and verify 12V, ground, and LIN continuity',
      'If vehicle has manual wipers only, disable Rain/Light Sensor in BCM coding'
    ],
    severity: 'warning'
  },
  'P0101': {
    code: 'P0101',
    title: 'Mass Air Flow (MAF) Range / Performance',
    system: 'Air Intake & Metering',
    meaning: 'Airflow reported by sensor G70 disagrees with expected flow for the current RPM and boost.',
    causes: [
      'Contaminated MAF sensing film',
      'Split intake hose downstream of MAF',
      'Sticking EGR valve altering fresh air draw'
    ],
    fixes: [
      'Check intake ducting between MAF and turbo inlet for splits or loose clips',
      'Clean MAF sensor with dedicated cleaner spray and compare live specified vs actual airflow'
    ],
    severity: 'warning'
  },
  'P0299': {
    code: 'P0299',
    vagCode: '00665',
    title: 'Turbocharger / Supercharger Underboost',
    system: 'Turbocharger & Boost',
    meaning: 'Measured manifold boost stayed significantly below the ECU target pressure.',
    causes: [
      'Split rubber boost hose or leaking intercooler joint',
      'Perished vacuum line or perforated turbo actuator diaphragm',
      'Weak N75 boost control solenoid or sticking VNT vanes'
    ],
    fixes: [
      'Smoke- or pressure-test charge pipes and intercooler for boost leaks',
      'Vacuum-test turbo actuator capsule (~18 inHg should hold steady) and inspect vacuum hoses'
    ],
    severity: 'danger'
  },
  'P0300': {
    code: 'P0300',
    vagCode: '16684',
    title: 'Random / Multiple Cylinder Misfire',
    system: 'Ignition & Combustion',
    meaning: 'Crankshaft speed variations indicate combustion misfires across multiple cylinders.',
    causes: [
      'Worn spark plugs or failing ignition coils (petrol)',
      'Intake air / PCV membrane leak',
      'Low fuel rail pressure or injector fouling'
    ],
    fixes: [
      'Check individual cylinder misfire counters in live data',
      'Inspect PCV breather valve, intake hoses, and fuel rail pressure'
    ],
    severity: 'danger'
  },
  'P0401': {
    code: 'P0401',
    vagCode: '01025',
    title: 'EGR Flow Insufficient',
    system: 'EGR & Emissions',
    meaning: 'Fresh airflow did not drop as expected when the EGR valve was commanded open.',
    causes: [
      'Carbon buildup restricting EGR valve or cooler passages',
      'Worn internal gears in electric EGR actuator'
    ],
    fixes: [
      'Inspect and clean EGR valve/cooler tract and run EGR basic adaptation'
    ],
    severity: 'warning'
  },
  'P2015': {
    code: 'P2015',
    vagCode: '08213',
    title: 'Intake Manifold Flap Position Sensor Range / Performance',
    system: 'Induction & Swirl Flaps',
    meaning: 'Swirl-flap actuator feedback went beyond its calibrated mechanical end-stop window.',
    causes: [
      'Worn stop on 2.0 TDI manifold flap lever allowing motor over-rotation',
      'Carbon buildup on intake swirl flaps'
    ],
    fixes: [
      'Inspect manifold flap lever stop (an aluminium limit bracket fixes over-travel on common-rail 2.0 TDI manifolds)'
    ],
    severity: 'warning'
  }
};

const VAG_CROSS_REF = new Map();
const UDS_EVENTS_MAP = new Map([
  ['0X01:15916', 'P0671'],
  ['0X02:10776', 'P177B'],
  ['0X02:10778', 'P177C'],
  ['0X02:10812', 'P1895'],
  ['*:533541', 'U1121'],
  ['*:534549', 'U1121']
]);
const CUSTOM_DTCS = new Map();
const CUSTOM_STORAGE_KEY = 'vibesodb2_custom_dtcs';
let _dbLoaded = false;
let _dbLoadPromise = null;

function _indexEntry(key, val) {
  const normKey = String(key).trim().toUpperCase();
  const entry = { ...val, code: normKey };
  DTC_KNOWLEDGE_BASE[normKey] = entry;
  if (entry.vagCode) {
    const vc = String(entry.vagCode).trim().toUpperCase();
    if (!DTC_KNOWLEDGE_BASE[vc]) {
      VAG_CROSS_REF.set(vc, normKey);
    }
  }
}

for (const [k, v] of Object.entries(DTC_KNOWLEDGE_BASE)) {
  _indexEntry(k, v);
}

function _getBrowserStorage() {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function _loadSavedCustomDtcs() {
  try {
    const store = _getBrowserStorage();
    if (store) {
      const raw = store.getItem(CUSTOM_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          registerCustomDtcs(parsed, false);
        }
      }
    }
  } catch (_) {}
}
_loadSavedCustomDtcs();

/**
 * Loads the expanded bundled pwa/data/dtcs.json dictionary once (works in Browser & Node.js tests).
 */
export async function ensureDtcDatabaseLoaded() {
  if (_dbLoaded) return true;
  if (_dbLoadPromise) return _dbLoadPromise;

  _dbLoadPromise = (async () => {
    try {
      let json = null;
      const jsonUrl = new URL('../data/dtcs.json', import.meta.url);
      if (typeof process !== 'undefined' && process.versions?.node) {
        const [{ readFile }, { fileURLToPath }] = await Promise.all([
          import('node:fs/promises'),
          import('node:url')
        ]);
        const text = await readFile(fileURLToPath(jsonUrl), 'utf8');
        json = JSON.parse(text);
      } else if (typeof fetch === 'function') {
        const resp = await fetch(jsonUrl.href);
        if (resp.ok) {
          json = await resp.json();
        }
      }

      if (json?.uds_events && typeof json.uds_events === 'object') {
        for (const [ek, ev] of Object.entries(json.uds_events)) {
          if (typeof ev === 'string') {
            UDS_EVENTS_MAP.set(String(ek).trim().toUpperCase(), ev.trim().toUpperCase());
          }
        }
      }

      const codes = json?.codes || json;
      if (codes && typeof codes === 'object') {
        for (const [k, v] of Object.entries(codes)) {
          if (k === '_meta' || k === 'uds_events' || !v || typeof v !== 'object') continue;
          _indexEntry(k, v);
        }
        _dbLoaded = true;
      }
    } catch (_) {
      // Offline / missing file fallback keeps seed dictionary operational
    }
    return _dbLoaded;
  })();

  return _dbLoadPromise;
}

/**
 * Registers user-imported local DTC definitions (stored only in browser localStorage).
 * Accepts either { "P1234": "Short description" } or { "P1234": { title, meaning, causes, fixes } }.
 */
export function registerCustomDtcs(entriesMap, persist = true) {
  if (!entriesMap || typeof entriesMap !== 'object') return 0;
  const sourceObj = entriesMap.codes && typeof entriesMap.codes === 'object' ? entriesMap.codes : entriesMap;
  let added = 0;

  for (const [rawKey, rawVal] of Object.entries(sourceObj)) {
    if (rawKey === '_meta') continue;
    const key = String(rawKey || '').trim().toUpperCase();
    if (!key) continue;

    if (typeof rawVal === 'string') {
      CUSTOM_DTCS.set(key, {
        code: key,
        title: rawVal.slice(0, 120),
        system: classifySaeSubsystem(key).subsystem,
        meaning: rawVal,
        causes: [],
        fixes: [],
        severity: 'warning'
      });
      added++;
    } else if (rawVal && typeof rawVal === 'object') {
      CUSTOM_DTCS.set(key, {
        code: key,
        title: String(rawVal.title || rawVal.description || key),
        system: String(rawVal.system || classifySaeSubsystem(key).subsystem),
        meaning: String(rawVal.meaning || rawVal.description || rawVal.title || ''),
        causes: Array.isArray(rawVal.causes) ? rawVal.causes.map(String) : [],
        fixes: Array.isArray(rawVal.fixes) ? rawVal.fixes.map(String) : [],
        severity: rawVal.severity || 'warning',
        vagCode: rawVal.vagCode ? String(rawVal.vagCode) : undefined
      });
      added++;
    }
  }

  if (persist) {
    try {
      const store = _getBrowserStorage();
      if (store) {
        store.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(Object.fromEntries(CUSTOM_DTCS)));
      }
    } catch (_) {}
  }
  return added;
}

export function clearCustomDtcs(persist = true) {
  CUSTOM_DTCS.clear();
  if (persist) {
    try {
      const store = _getBrowserStorage();
      if (store) {
        store.removeItem(CUSTOM_STORAGE_KEY);
      }
    } catch (_) {}
  }
}

export function getDtcDatabaseStats() {
  return {
    totalCodes: Object.keys(DTC_KNOWLEDGE_BASE).length,
    customCodes: CUSTOM_DTCS.size,
    loaded: _dbLoaded
  };
}

/**
 * Decodes two ISO 15031-6 / SAE J2012 bytes into a 5-character code (e.g. 0x90, 0x4A -> "B104A").
 */
export function decodeSaeJ2012(b0, b1) {
  const families = ['P', 'C', 'B', 'U'];
  const family = families[(b0 >> 6) & 0x03];
  const d1 = (b0 >> 4) & 0x03;
  const d2 = (b0 & 0x0F).toString(16).toUpperCase();
  const d3 = ((b1 >> 4) & 0x0F).toString(16).toUpperCase();
  const d4 = (b1 & 0x0F).toString(16).toUpperCase();
  return `${family}${d1}${d2}${d3}${d4}`;
}

/**
 * Encodes an SAE J2012 DTC string (e.g. "P0299", "B104A15", "B104A-15", "U010087")
 * into a 3-byte UDS DTC [DTCHighByte, DTCMiddleByte, DTCLowByte/FTB].
 */
export function encodeSaeDtcBytes(codeStr, ftbOverride = null) {
  const cleaned = String(codeStr || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const match = /^([PCBU])([0-3])([0-9A-F])([0-9A-F]{2})([0-9A-F]{2})?$/.exec(cleaned);
  if (!match) {
    throw new Error(`Invalid SAE J2012 DTC string: ${codeStr}`);
  }
  const familyIdx = { P: 0, C: 1, B: 2, U: 3 }[match[1]];
  const d1 = parseInt(match[2], 10);
  const d2 = parseInt(match[3], 16);
  const b0 = (familyIdx << 6) | (d1 << 4) | d2;
  const b1 = parseInt(match[4], 16);
  const b2 = ftbOverride !== null && ftbOverride !== undefined
    ? (ftbOverride & 0xFF)
    : (match[5] ? parseInt(match[5], 16) : 0x00);
  return new Uint8Array([b0, b1, b2]);
}

/**
 * Converts VAG KWP2000 16384-offset 5-digit powertrain codes (16385..20479) to SAE P-codes.
 * Formula: 16384 + (d1 * 1024) + decimal(d2d3d4), e.g. 16683 -> P0299, 16502 -> P0118, 18010 -> P1602.
 */
export function vagKwpToSaePCode(decNum) {
  if (typeof decNum !== 'number' || decNum <= 16384 || decNum >= 20480) return null;
  const diff = decNum - 16384;
  const d1 = Math.floor(diff / 1024);
  const rem = diff % 1024;
  if (d1 < 0 || d1 > 3 || rem > 999) return null;
  return `P${d1}${String(rem).padStart(3, '0')}`;
}

/**
 * Classifies an SAE code structurally by family, standard/manufacturer scope, and subsystem.
 */
export function classifySaeSubsystem(code) {
  const upper = String(code || '').toUpperCase().replace(/-.*$/, '');
  const m = /^([PCBU])([0-3])([0-9A-F])/.exec(upper);
  if (!m) {
    return { familyName: 'Vehicle Control Module', scope: 'Manufacturer-Specific', subsystem: 'Controller Diagnostics' };
  }
  const [, fam, d1, d2] = m;
  const isStd = d1 === '0' || (d1 === '2' && fam === 'P') || (d1 === '3' && fam === 'P' && parseInt(d2, 16) >= 4);
  const scope = isStd ? 'ISO/SAE Standard' : 'Manufacturer-Specific';

  if (fam === 'P') {
    const pSub = {
      '0': 'Fuel, Air & Auxiliary Emission Controls',
      '1': 'Fuel & Air Metering',
      '2': 'Fuel Delivery & Injector Circuits',
      '3': 'Ignition Systems, Timing & Misfire Detection',
      '4': 'Auxiliary Emission Controls (EGR / DPF / SCR / EVAP)',
      '5': 'Vehicle Speed, Idle Control & Auxiliary Inputs',
      '6': 'ECU Internal, 5V Reference & Output Circuits',
      '7': 'Transmission & Gearbox Control',
      '8': 'Transmission & Mechatronic Systems',
      '9': 'Transmission Control',
      'A': 'Hybrid / Electric Propulsion'
    };
    return {
      familyName: 'Powertrain',
      scope,
      subsystem: pSub[d2] || 'Powertrain Control'
    };
  }
  if (fam === 'C') {
    return { familyName: 'Chassis', scope, subsystem: 'Brakes, ABS/ESP, Steering & Suspension' };
  }
  if (fam === 'B') {
    return { familyName: 'Body', scope, subsystem: 'Body Electrics, Comfort, HVAC & Restraints' };
  }
  // U-codes
  let sub = 'CAN / LIN Network Communication';
  if (upper.startsWith('U01') || upper.startsWith('U02')) sub = 'CAN Module Lost Communication';
  else if (upper.startsWith('U04')) sub = 'Implausible / Error-Flagged Data Received on CAN';
  else if (upper.startsWith('U11')) sub = 'VAG Databus Missing / Fault-Substituted Signal';
  return { familyName: 'Network', scope, subsystem: sub };
}

function _normalizeModuleAddr(moduleAddress) {
  if (moduleAddress === null || moduleAddress === undefined) return null;
  if (typeof moduleAddress === 'number') {
    return `0x${moduleAddress.toString(16).padStart(2, '0').toLowerCase()}`;
  }
  const s = String(moduleAddress).trim().toLowerCase();
  if (s.startsWith('0x')) return `0x${s.slice(2).padStart(2, '0')}`;
  if (/^[0-9a-f]{1,2}$/.test(s)) return `0x${s.padStart(2, '0')}`;
  return s;
}

function _lookupRecord(key) {
  if (!key) return null;
  const k = String(key).trim().toUpperCase();
  if (CUSTOM_DTCS.has(k)) return { record: CUSTOM_DTCS.get(k), source: 'custom' };
  if (DTC_KNOWLEDGE_BASE[k]) return { record: DTC_KNOWLEDGE_BASE[k], source: 'bundled' };
  if (VAG_CROSS_REF.has(k)) {
    const target = VAG_CROSS_REF.get(k);
    if (DTC_KNOWLEDGE_BASE[target]) return { record: DTC_KNOWLEDGE_BASE[target], source: 'bundled' };
  }
  return null;
}

function _lookupOdxEvent(modNorm, dec24) {
  const decStr = String(dec24);
  // 1. Check user custom overrides first ("0x02:10776", "UDS:10776", "VAG 10776")
  const customKeys = [
    modNorm ? `${modNorm.toUpperCase()}:${decStr}` : null,
    `UDS:${decStr}`,
    `VAG ${decStr}`
  ].filter(Boolean);
  for (const ck of customKeys) {
    if (CUSTOM_DTCS.has(ck)) {
      return { customRecord: CUSTOM_DTCS.get(ck), mappedSae: null };
    }
  }

  // 2. Check bundled verified UDS ODX event map
  if (modNorm) {
    const scoped = UDS_EVENTS_MAP.get(`${modNorm.toUpperCase()}:${decStr}`);
    if (scoped) return { customRecord: null, mappedSae: scoped };
  }
  const wildcard = UDS_EVENTS_MAP.get(`*:${decStr}`);
  if (wildcard) return { customRecord: null, mappedSae: wildcard };
  return null;
}

/**
 * Decodes a 3-byte UDS DTC (Service 0x19 02) with module and ASAM/ODX context.
 * Distinguishes:
 *   1) VAG 24-bit ASAM/ODX manufacturer event numbers (on EV_* ODX modules, TCM b0 < 0x07, or b0 == 0x00 non-FTB),
 *   2) VAG 5-digit decimal codes on legacy/non-ODX body modules,
 *   3) Standard SAE J2012 P/C/B/U + ISO 14229-1 FTB records.
 */
export function decodeUdsDtcBytes(b0, b1, b2, statusByte = null, moduleAddress = null, options = {}) {
  const modNorm = _normalizeModuleAddr(moduleAddress);
  const isPowertrain = modNorm === '0x01' || modNorm === '0x02' || !modNorm;
  const odxName = options?.odxName ? String(options.odxName).trim() : null;
  const isVagOdxModule = Boolean(odxName && /^EV_/i.test(odxName));
  const rawHex = `0x${b0.toString(16).padStart(2, '0')}${b1.toString(16).padStart(2, '0')}${b2.toString(16).padStart(2, '0')}`.toUpperCase();
  const b2Hex = b2.toString(16).padStart(2, '0').toUpperCase();

  const saeBase = decodeSaeJ2012(b0, b1);
  const dec16 = (b0 << 8) | b1;
  const vag5 = dec16.toString().padStart(5, '0');
  const dec24 = (b0 << 16) | (b1 << 8) | b2;
  const odxHit = _lookupOdxEvent(modNorm, dec24);

  const isVag24Event =
    isVagOdxModule ||
    (modNorm === '0x02' && b0 < 0x07) ||
    (b0 === 0x00 && b2 !== 0x00 && !(b2 in UDS_FTB_CODES)) ||
    Boolean(odxHit && b0 === 0x00);

  if (isVag24Event) {
    const vagEventStr = String(dec24);
    if (odxHit?.customRecord) {
      const rec = odxHit.customRecord;
      return {
        code: `VAG ${vagEventStr}`,
        baseCode: vagEventStr,
        saeCode: null,
        vagCode: vagEventStr,
        rawHex,
        uds24Dec: dec24,
        ftbHex: null,
        odxName,
        title: rec.title,
        system: rec.system || 'VAG ASAM/ODX Control Unit',
        meaning: rec.meaning,
        causes: rec.causes || [],
        fixes: rec.fixes || [],
        severity: rec.severity || 'warning',
        symptom: null,
        symptomDetail: null,
        isIntermittent: false,
        statusByte: statusByte !== null && statusByte !== undefined
          ? (typeof statusByte === 'number' ? `0x${statusByte.toString(16).padStart(2, '0').toUpperCase()}` : String(statusByte))
          : null,
        isKnown: true,
        source: 'custom'
      };
    }

    if (odxHit?.mappedSae) {
      const parsed = lookupDtc(odxHit.mappedSae, statusByte, null, {
        protocol: 'UDS',
        moduleAddress: modNorm,
        vagAlias: vagEventStr
      });
      return {
        ...parsed,
        code: odxHit.mappedSae,
        baseCode: odxHit.mappedSae,
        saeCode: odxHit.mappedSae,
        vagCode: vagEventStr,
        symptom: null,
        symptomDetail: null,
        rawHex,
        uds24Dec: dec24,
        ftbHex: null,
        odxName
      };
    }

    // Honest unlisted VAG 24-bit ODX event — never fabricate a false SAE P00xx or FTB label (AGENTS.md Rule 10)
    const datasetNote = odxName ? ` on dataset ${odxName}` : '';
    return {
      code: `VAG ${vagEventStr}`,
      baseCode: vagEventStr,
      saeCode: null,
      vagCode: vagEventStr,
      rawHex,
      uds24Dec: dec24,
      ftbHex: null,
      odxName,
      title: `Unlisted VAG UDS Fault Event (${vagEventStr})`,
      system: 'VAG ASAM/ODX Control Unit',
      meaning: `VAG 24-bit UDS manufacturer event ${vagEventStr} (${rawHex})${datasetNote} is not yet in the bundled vibesODB2 reference dictionary. VAG ASAM/ODX control units map 24-bit decimal event numbers to SAE codes via module-specific dataset tables; cross-reference event ${vagEventStr} with the module part number${odxName ? ' or ODX dataset' : ''}.`,
      causes: [],
      fixes: [],
      severity: 'warning',
      symptom: null,
      symptomDetail: null,
      isIntermittent: false,
      statusByte: statusByte !== null && statusByte !== undefined
        ? (typeof statusByte === 'number' ? `0x${statusByte.toString(16).padStart(2, '0').toUpperCase()}` : String(statusByte))
        : null,
      isKnown: false,
      source: 'unlisted'
    };
  }

  let useVag5 = false;
  if (b0 < 0x40 && !isPowertrain) {
    if (_lookupRecord(vag5) || b0 < 0x10) {
      useVag5 = true;
    }
  }

  if (useVag5) {
    const parsed = lookupDtc(dec16, statusByte, b2, {
      protocol: 'UDS',
      moduleAddress: modNorm,
      ftbByte: b2
    });
    return {
      ...parsed,
      rawHex,
      uds24Dec: dec24,
      ftbHex: b2 !== 0 ? `0x${b2Hex}` : null,
      odxName
    };
  }

  const displayCode = b2 !== 0 ? `${saeBase}-${b2Hex}` : saeBase;
  const parsed = lookupDtc(saeBase, statusByte, null, {
    protocol: 'UDS',
    moduleAddress: modNorm,
    ftbByte: b2,
    displayCodeOverride: displayCode,
    vagAlias: isPowertrain ? vag5 : null
  });

  return {
    ...parsed,
    code: displayCode,
    baseCode: saeBase,
    rawHex,
    uds24Dec: dec24,
    ftbHex: b2 !== 0 ? `0x${b2Hex}` : null,
    odxName
  };
}

/**
 * Standardize and look up a DTC code with UDS Failure Type Byte or KWP2000 symptom decoding.
 *
 * @param {string|number} rawCode - e.g. "01117", 1117, "P0299", "B104A-15", "0x904A15"
 * @param {number|string} [statusByte] - UDS status byte
 * @param {number|string} [symptomByte] - KWP2000 symptom byte (or legacy FTB)
 * @param {object} [options] - { protocol, moduleAddress, ftbByte, displayCodeOverride, vagAlias }
 */
export function lookupDtc(rawCode, statusByte = null, symptomByte = null, options = {}) {
  let normalized = String(rawCode ?? '').trim().toUpperCase();
  const protocol = options.protocol || null;
  let vagDecCode = options.vagAlias || null;
  let saeCode = null;
  let baseCode = normalized;
  let ftbByte = options.ftbByte !== undefined ? options.ftbByte : null;

  // Handle "B104A-15" or 7-char "B104A15" inputs directly
  const saeWithFtb = /^([PCBU][0-3][0-9A-F]{3})-?([0-9A-F]{2})$/.exec(normalized);
  if (saeWithFtb) {
    baseCode = saeWithFtb[1];
    saeCode = baseCode;
    if (ftbByte === null) ftbByte = parseInt(saeWithFtb[2], 16);
    normalized = `${baseCode}-${saeWithFtb[2]}`;
  } else if (/^[PCBU][0-3][0-9A-F]{3}$/.test(normalized)) {
    baseCode = normalized;
    saeCode = normalized;
  } else if (normalized.startsWith('0X')) {
    const hexStr = normalized.slice(2);
    const hexNum = parseInt(hexStr, 16);
    if (!Number.isNaN(hexNum)) {
      if (hexStr.length === 6) {
        const b0 = (hexNum >> 16) & 0xFF;
        const b1 = (hexNum >> 8) & 0xFF;
        const b2 = hexNum & 0xFF;
        return decodeUdsDtcBytes(b0, b1, b2, statusByte, options.moduleAddress);
      }
      if (hexNum <= 0xFFFF) {
        vagDecCode = hexNum.toString().padStart(5, '0');
        baseCode = vagDecCode;
      }
    }
  } else if (/^\d{1,5}$/.test(normalized)) {
    const decNum = parseInt(normalized, 10);
    vagDecCode = decNum.toString().padStart(5, '0');
    baseCode = vagDecCode;
    const derivedP = vagKwpToSaePCode(decNum);
    if (derivedP) {
      saeCode = derivedP;
    }
  }

  // Lookup priority:
  // 1. Exact full code (e.g. custom override on "B104A-15")
  // 2. Base code (e.g. "B104A", "P0299", "01117")
  // 3. Derived SAE P-code (e.g. KWP 16683 -> "P0299")
  // 4. VAG 5-digit decimal alias
  const hit =
    _lookupRecord(normalized) ||
    _lookupRecord(baseCode) ||
    (saeCode ? _lookupRecord(saeCode) : null) ||
    (vagDecCode ? _lookupRecord(vagDecCode) : null);

  const record = hit?.record || null;
  const source = hit?.source || 'unlisted';
  if (!saeCode && record?.code && /^[PCBU]/.test(record.code)) {
    saeCode = record.code;
  }

  // Decode UDS Failure Type Byte (FTB) or KWP2000 Symptom Byte
  let symptomLabel = null;
  let symptomDetail = null;
  let kwpIntermittent = false;

  if (ftbByte !== null && ftbByte !== undefined) {
    const ftbNum = typeof ftbByte === 'number' ? ftbByte : parseInt(String(ftbByte), 16);
    if (!Number.isNaN(ftbNum) && ftbNum !== 0) {
      const ftbEntry = UDS_FTB_CODES[ftbNum];
      const vagEntry = VAG_SYMPTOM_CODES[String(ftbNum).padStart(3, '0')];
      if (ftbEntry && (!vagDecCode || saeCode)) {
        symptomLabel = `FTB 0x${ftbNum.toString(16).padStart(2, '0').toUpperCase()}: ${ftbEntry.label}`;
        symptomDetail = ftbEntry.description;
      } else if (vagEntry) {
        symptomLabel = vagEntry.label;
        symptomDetail = vagEntry.description;
      } else if (ftbEntry) {
        symptomLabel = `FTB 0x${ftbNum.toString(16).padStart(2, '0').toUpperCase()}: ${ftbEntry.label}`;
        symptomDetail = ftbEntry.description;
      }
    }
  }

  if (!symptomLabel && symptomByte !== null && symptomByte !== undefined) {
    let rawSymNum = NaN;
    if (typeof symptomByte === 'number') {
      rawSymNum = symptomByte;
    } else {
      const s = String(symptomByte).trim();
      rawSymNum = s.startsWith('0x') || s.startsWith('0X') ? parseInt(s.slice(2), 16) : parseInt(s, 10);
    }
    if (!Number.isNaN(rawSymNum)) {
      // In VAG KWP2000 (Service 0x18), bit 7 (0x80) flags an intermittent/sporadic fault
      if (protocol === 'KWP2000' && (rawSymNum & 0x80) !== 0) {
        kwpIntermittent = true;
        rawSymNum = rawSymNum & 0x7F;
      }
      const symKey = String(rawSymNum).padStart(3, '0');
      const symInfo = VAG_SYMPTOM_CODES[symKey] || (UDS_FTB_CODES[rawSymNum] ? {
        label: UDS_FTB_CODES[rawSymNum].label,
        description: UDS_FTB_CODES[rawSymNum].description
      } : null);
      if (symInfo && rawSymNum !== 0) {
        symptomLabel = symInfo.label;
        symptomDetail = symInfo.description;
      }
    }
  }

  const displayCode = options.displayCodeOverride || (vagDecCode && !saeWithFtb && !/^[PCBU]/.test(normalized) ? vagDecCode : normalized);
  const structInfo = classifySaeSubsystem(saeCode || baseCode);

  let defaultSystem = structInfo.subsystem;
  if (!saeCode && vagDecCode) {
    if (vagDecCode.startsWith('0058') || vagDecCode.startsWith('0121') || vagDecCode.startsWith('0122')) defaultSystem = 'SRS Airbag System';
    else if (vagDecCode.startsWith('0028') || vagDecCode.startsWith('0029') || vagDecCode === '01316') defaultSystem = 'Brakes & ABS';
    else if (vagDecCode.startsWith('0111') || vagDecCode.startsWith('0159') || vagDecCode === '00532') defaultSystem = 'Electrical & Charging';
  }

  // Honest unlisted description: state only what the protocol bytes actually establish.
  let unlistedTitle = saeCode
    ? `${structInfo.scope} ${structInfo.familyName} Fault (${saeCode})`
    : `Unlisted VAG Fault Code ${displayCode}`;
  if (symptomLabel && !record) {
    unlistedTitle = `${saeCode || `Code ${displayCode}`} — ${symptomLabel.replace(/^FTB 0x[0-9A-F]{2}:\s*/, '')}`;
  }

  let unlistedMeaning = `Code ${displayCode}${saeCode && saeCode !== displayCode ? ` (${saeCode})` : ''} is not yet in the bundled vibesODB2 reference dictionary.`;
  if (saeCode) {
    unlistedMeaning += ` Prefix classification: ${structInfo.scope} ${structInfo.familyName} — ${structInfo.subsystem}.`;
  }
  if (symptomDetail) {
    unlistedMeaning += ` Reported electrical/mechanical failure subtype: ${symptomLabel} (${symptomDetail})`;
  } else {
    unlistedMeaning += ' Cross-reference the exact code and module part number in an official workshop manual.';
  }

  return {
    code: displayCode,
    baseCode,
    saeCode: saeCode || null,
    vagCode: record?.vagCode || vagDecCode || null,
    title: record?.title || unlistedTitle,
    system: record?.system || defaultSystem,
    meaning: record?.meaning || unlistedMeaning,
    // Never fabricate generic causes/fixes for unlisted codes (AGENTS.md Rule 10)
    causes: record ? (record.causes || []) : [],
    fixes: record ? (record.fixes || []) : [],
    severity: record?.severity || 'warning',
    symptom: symptomLabel,
    symptomDetail,
    isIntermittent: kwpIntermittent,
    statusByte: statusByte !== null && statusByte !== undefined
      ? (typeof statusByte === 'number' ? `0x${statusByte.toString(16).padStart(2, '0').toUpperCase()}` : String(statusByte))
      : null,
    isKnown: !!record,
    source
  };
}
