// vibesODB2 - VAG & SAE Diagnostic Trouble Code (DTC) Knowledge Base
// Provides human-readable descriptions, symptom decoding, real-world failure causes, and suggested fixes.

/**
 * Common VAG Failure Type Bytes (FTB) & Symptom Codes
 */
export const VAG_SYMPTOM_CODES = {
  '001': { label: 'Upper Limit Exceeded', description: 'Signal or value measured is higher than maximum calibrated parameter.' },
  '002': { label: 'Lower Limit Exceeded', description: 'Signal or value measured is below minimum calibrated operating threshold.' },
  '003': { label: 'Mechanical Failure', description: 'Actuator or mechanical linkage jammed, worn, or physically disconnected.' },
  '004': { label: 'No Signal / Communication', description: 'No electrical pulses or data packets detected on signal wire.' },
  '005': { label: 'Short Circuit to Plus (+)', description: 'Signal wire has shorted to +12V power rail.' },
  '006': { label: 'Short Circuit to Ground (-)', description: 'Signal wire has shorted to vehicle chassis or ground rail.' },
  '007': { label: 'Short to Ground or Open Circuit', description: 'Circuit broken or grounded.' },
  '008': { label: 'Implausible Signal', description: 'Signal received is erratic, noisy, or conflicts with other sensor readings.' },
  '009': { label: 'Open Circuit or Short to Plus', description: 'Circuit broken or shorted to battery voltage.' },
  '010': { label: 'Open Circuit', description: 'Signal or ground wire physically severed or connector unplugged.' },
  '011': { label: 'Intermittent / Limit Not Reached', description: 'Fault triggered intermittently during driving cycles.' },
  '012': { label: 'Electrical Fault in Circuit', description: 'Internal electrical impedance or load fault detected.' },
  '014': { label: 'Defective / Faulty', description: 'Internal component self-test failed.' },
  '016': { label: 'Signal Outside Tolerance', description: 'Sensor calibration has drifted beyond adaptation boundaries.' },
  '027': { label: 'Implausible Signal', description: 'Inconsistent data received across CAN bus.' },
  '028': { label: 'Short to Plus', description: 'Circuit shorted to battery power.' },
  '029': { label: 'Short to Ground', description: 'Circuit shorted to chassis earth.' },
  '030': { label: 'Open Circuit / Short to Plus', description: 'Wiring broken or pulled high.' },
  '031': { label: 'Open Circuit / Short to Ground', description: 'Wiring broken or pulled low.' },
  '032': { label: 'Resistance Too High (32-00)', description: 'Electrical contact resistance or squib circuit resistance is excessively high.' },
  '033': { label: 'Resistance Too Low (33-00)', description: 'Circuit resistance is below safety limit (possible pinched wire or short).' },
  '035': { label: 'Open Circuit (35-00)', description: 'Complete circuit disconnection.' },
  '037': { label: 'Faulty (37-00)', description: 'Component internal hardware failure.' }
};

/**
 * Curated VAG 5-Digit Decimal Fault Codes & Common SAE P-Codes Database
 */
export const DTC_KNOWLEDGE_BASE = {
  // --- Charging & Battery Voltage ---
  '01117': {
    code: '01117',
    title: 'Generator Terminal DF Load Signal',
    system: 'Alternator & Charging System',
    meaning: 'The alternator Dynamo Field (DF) load signal sent to the Central Electrics module or ECU is missing, noisy, or implausible.',
    causes: [
      'Broken or chafed DF wire (usually blue or blue/brown) in the wiring harness near the starter motor or gearbox bellhousing',
      'Corroded 2-pin DFM/DF connector on the back of the alternator',
      'Faulty alternator voltage regulator or worn brushes',
      'Blown auxiliary engine-bay pre-fuse'
    ],
    fixes: [
      'Inspect the 2-pin connector on the alternator and follow the harness down to the starter bracket—look for a snapped wire inside the corrugated plastic sleeve',
      'Perform a continuity test between the alternator DF pin and Central Electrics module pin',
      'Check alternator charging voltage with engine idling (should read 13.8V to 14.4V)',
      'Replace the alternator voltage regulator if wiring is intact and brushes are worn'
    ],
    severity: 'warning'
  },
  '01598': {
    code: '01598',
    title: 'Drive Battery Voltage',
    system: 'Battery & Power Supply',
    meaning: 'The vehicle supply voltage measured by the Central Electrics (Bordnetz) module fell below the critical lower threshold (under ~10.5V).',
    causes: [
      'Vehicle parked for extended periods resulting in battery discharge',
      'Weak or sulfated AGM/lead-acid battery collapsing under heavy starter cranking',
      'Loose or corroded battery terminal clamps or main chassis ground strap',
      'Alternator undercharging or slipping serpentine auxiliary belt'
    ],
    fixes: [
      'Test resting battery voltage with engine off (healthy battery should read > 12.4V)',
      'Perform a cold-cranking load test (voltage must not drop below 10.0V during starter engagement)',
      'Clean battery terminal posts and ensure the main negative ground strap to the chassis/gearbox is clean and tight',
      'Recharge or replace vehicle battery, then clear fault codes'
    ],
    severity: 'warning'
  },
  '00532': {
    code: '00532',
    title: 'Supply Voltage B+',
    system: 'Power Distribution',
    meaning: 'The control module detected an abnormally low or high supply voltage from Terminal 30.',
    causes: [
      'Jump-starting the vehicle or low battery cranking dip',
      'Corroded fuse box contacts or main power relay (Relay 109 / Relay 100)',
      'Loose battery terminal connection'
    ],
    fixes: [
      'Check vehicle battery condition and charge state',
      'Inspect main power relays and power distribution block on top of battery',
      'Clear fault code and re-test after driving'
    ],
    severity: 'info'
  },

  // --- Airbag & Safety Systems ---
  '00588': {
    code: '00588',
    title: 'Airbag Igniter; Driver Side (N95)',
    system: 'SRS Airbag Safety System',
    meaning: 'Resistance in the driver’s steering wheel airbag squib circuit (N95) is outside acceptable safety parameters (typically 2.2Ω to 3.5Ω).',
    causes: [
      'Worn or cracked steering column clockspring (spiral cable / slip ring behind steering wheel)',
      'Loose, oxidized, or unclipped yellow airbag connector under steering column or behind airbag module',
      'Pinched airbag wiring harness inside steering wheel',
      'Defective driver airbag squib unit'
    ],
    fixes: [
      '⚠️ CAUTION: Disconnect vehicle battery negative lead and wait 15 minutes before touching airbag wiring!',
      'Inspect and reseat the yellow connector behind the steering wheel and at the steering column base',
      'Check clockspring continuity using diagnostic measuring blocks (never use a standard multimeter directly on the airbag squib!)',
      'Replace the steering column clockspring / slip ring assembly if resistance is abnormal',
      'Use the Clear DTCs button to reset the Airbag warning light (airbag lights never self-clear)'
    ],
    severity: 'danger'
  },
  '00589': {
    code: '00589',
    title: 'Airbag Igniter 1; Passenger Side (N131)',
    system: 'SRS Airbag Safety System',
    meaning: 'Electrical fault or improper resistance measured in the front passenger dashboard airbag circuit.',
    causes: [
      'Loose yellow airbag harness connector behind the glovebox',
      'Faulty passenger airbag igniter squib',
      'Wiring harness damage'
    ],
    fixes: [
      'Disconnect battery for 15 minutes before inspection',
      'Inspect yellow harness connector behind glove compartment',
      'Check wiring harness for chafing or corrosion, re-seat connector and clear code'
    ],
    severity: 'danger'
  },
  '01217': {
    code: '01217',
    title: 'Side Airbag Igniter; Driver Side (N199)',
    system: 'SRS Airbag Safety System',
    meaning: 'Circuit resistance fault in the driver seat-mounted side thorax airbag.',
    causes: [
      'Extremely common: yellow connector under the driver seat jostled or corroded when seat is adjusted back/forth',
      'Damaged wiring under carpet'
    ],
    fixes: [
      'Disconnect battery for 15 minutes',
      'Inspect yellow wiring connector under the driver seat; clean pins with electrical contact cleaner and secure with zip-tie',
      'Clear airbag codes'
    ],
    severity: 'danger'
  },

  // --- CAN Bus & Network Communication ---
  '01314': {
    code: '01314',
    title: 'Engine Control Module (ECM)',
    system: 'CAN Network Communication',
    meaning: 'The CAN Gateway, ABS, or Central Electrics module lost communication with the primary Engine Control Module.',
    causes: [
      'ECM main power relay (Relay 109 on older TDIs, Relay 30/100) contacts intermittent or failing',
      'Blown ECM power supply fuse in engine bay E-box',
      'Water ingress or corrosion in the ECU connector plenum chamber under windshield cowl',
      'Twisted CAN wiring pair (pins 6 & 14) shorted or open'
    ],
    fixes: [
      'Inspect main ECM power relay (tap relay to check for cold solder joints)',
      'Check engine bay fuse box for blown fuses or corrosion',
      'Inspect ECU connectors for water intrusion from clogged windshield drain cowl grommets',
      'Verify CAN bus high/low wiring continuity between Gateway and Engine ECU'
    ],
    severity: 'danger'
  },
  '01316': {
    code: '01316',
    title: 'Brake Control Module (ABS)',
    system: 'CAN Network Communication',
    meaning: 'No communication or missing data from the Anti-lock Braking System (ABS) controller.',
    causes: [
      'Blown high-current fuse (30A/40A) on top of battery fuse tray feeding ABS pump',
      'Corrosion on ABS multi-pin connector plug under brake master cylinder',
      'Failed ABS module electronic control board'
    ],
    fixes: [
      'Check metal strip fuses on top of the battery',
      'Inspect main ABS connector for water ingress or loose locking lever',
      'Clear codes and test ABS communication'
    ],
    severity: 'danger'
  },
  '01336': {
    code: '01336',
    title: 'Company Comfort CAN Bus',
    system: 'CAN Bus Network',
    meaning: 'The Comfort / Convenience CAN bus is operating in single-wire emergency mode or has a bus fault.',
    causes: [
      'One wire of the Comfort CAN pair (orange/green or orange/brown) broken or shorted to ground',
      'Corrosion in door bellow wiring boots or under-carpet wiring splices',
      'Flooded Central Convenience module under driver carpet'
    ],
    fixes: [
      'Pull back the rubber wiring accordion bellows in all doors and inspect for cracked/broken wires',
      'Inspect wiring splices under passenger/driver seat floor for moisture',
      'Check Comfort CAN lines with an oscilloscope or multimeter'
    ],
    severity: 'warning'
  },
  '00003': {
    code: '00003',
    title: 'Control Module Defective',
    system: 'Internal Controller Hardware',
    meaning: 'Internal memory check (ROM/EEPROM) or processor self-test failed inside the control module.',
    causes: [
      'Internal hardware failure or corrupt EEPROM checksum',
      'Interrupted coding write or firmware flash',
      'Transient power spike damage'
    ],
    fixes: [
      'Attempt to re-write known valid Long Coding to recalculate EEPROM checksum',
      'Disconnect module power connector for 10 minutes for a hard reset',
      'If error returns immediately, module internal replacement or cloning is required'
    ],
    severity: 'danger'
  },

  // --- ABS, Steering & Chassis ---
  '00778': {
    code: '00778',
    title: 'Steering Angle Sensor (G85)',
    system: 'ABS / ESP & Steering',
    meaning: 'Steering angle sensor G85 is uncalibrated, out of adaptation range, or has lost zero-point position.',
    causes: [
      'Wheel alignment performed without resetting sensor zero point',
      'Steering wheel or steering rack removed and reinstalled off-center',
      'Loss of battery power while steering wheel was turned'
    ],
    fixes: [
      'Perform Steering Angle Sensor Basic Setting / Calibration procedure (drive straight at 20 km/h, turn wheel 90° left, 90° right, center)',
      'Inspect physical clockspring sensor ring alignment',
      'Check measured value block for G85 to ensure angle changes smoothly with wheel rotation'
    ],
    severity: 'warning'
  },
  '01423': {
    code: '01423',
    title: 'Lateral Acceleration Sensor (G200)',
    system: 'ABS / ESP Stability Control',
    meaning: 'ESP lateral acceleration sensor output signal is erratic or missing.',
    causes: [
      'Failed sensor chip or cracked solder joints inside G200 sensor module',
      'Loose sensor bracket under steering column or center console'
    ],
    fixes: [
      'Inspect G200 mounting bracket under steering column',
      'Perform Basic Setting for ESP lateral sensor on level ground',
      'Replace G200 sensor unit if signal remains static at 0 or max value'
    ],
    severity: 'warning'
  },
  '00283': {
    code: '00283',
    title: 'ABS Wheel Speed Sensor; Front Left (G47)',
    system: 'Brakes & ABS',
    meaning: 'ABS wheel speed sensor signal missing or irregular at the front left wheel.',
    causes: [
      'Rusted or split ABS reluctor ring / magnetic tone ring in wheel bearing',
      'Accumulation of metallic debris or mud on sensor tip',
      'Chafed sensor wire inside wheel arch from suspension travel',
      'Failed wheel speed sensor'
    ],
    fixes: [
      'Remove sensor and clean magnetic tip',
      'Inspect wheel bearing magnetic seal ring for physical damage or missing teeth',
      'Check sensor harness through wheel well for rubbing against tire',
      'Replace ABS wheel speed sensor'
    ],
    severity: 'warning'
  },

  // --- Central Electrics, Lighting & Locks ---
  '00928': {
    code: '00928',
    title: 'Locking Module for Central Locking; Driver Side (F220)',
    system: 'Central Locking & Door Modules',
    meaning: 'Implausible signal from microswitches inside the driver door lock actuator.',
    causes: [
      'Worn door latch microswitches or cracked solder joints on the internal lock PCB',
      'Broken wires in the flexible rubber door hinge bellow conduit'
    ],
    fixes: [
      'Inspect wires inside driver door hinge rubber bellow for fatigue breaks',
      'Replace driver door lock mechanism / actuator assembly'
    ],
    severity: 'info'
  },
  '00929': {
    code: '00929',
    title: 'Locking Module for Central Locking; Passenger Side (F221)',
    system: 'Central Locking & Door Modules',
    meaning: 'Implausible signal from passenger door lock actuator microswitches.',
    causes: [
      'Internal microswitch failure or broken wires in door jamb harness'
    ],
    fixes: [
      'Inspect passenger door hinge wiring harness',
      'Replace passenger door lock actuator'
    ],
    severity: 'info'
  },
  '01494': {
    code: '01494',
    title: 'Bulb for Parking Lamp; Left (M1)',
    system: 'Exterior Lighting',
    meaning: 'Current draw for left sidelight / parking light is below threshold.',
    causes: [
      'Burnt out sidelight bulb',
      'LED bulb installed without CAN-bus ballast resistor',
      'Corroded bulb socket contacts'
    ],
    fixes: [
      'Replace bulb or install CAN-bus compliant LED',
      'Clean bulb socket contacts'
    ],
    severity: 'info'
  },

  // --- Engine & TDI Powertrain (P-Codes & VAG Codes) ---
  'P0299': {
    code: 'P0299',
    vagCode: '00665',
    title: 'Turbocharger / Supercharger Underboost Condition',
    system: 'Turbocharger & Induction System',
    meaning: 'Measured manifold boost pressure is significantly lower than requested boost from the ECU map.',
    causes: [
      'Split or disconnected rubber boost pipe / intercooler hose',
      'Cracked plastic intercooler end-tank',
      'Stuck or leaking N75 boost control solenoid valve',
      'Leaking vacuum lines or split turbo actuator diaphragm',
      'Coked up / sticky Variable Nozzle Turbine (VNT) vanes inside turbo exhaust housing'
    ],
    fixes: [
      'Perform a smoke test or visual inspection of all boost hoses, joints, and intercooler for oily leaks',
      'Test vacuum at turbo actuator with a Mityvac hand pump (arm should move smoothly from 3 to 18 inHg)',
      'Check vacuum supply lines and test N75 duty cycle',
      'Exercise turbo VNT actuator linkage manually to feel for binding or carbon stickiness'
    ],
    severity: 'danger'
  },
  '00665': {
    code: '00665',
    vagCode: 'P0299',
    title: 'Boost Pressure Regulation: Control Range Not Reached',
    system: 'Turbocharger & Induction System',
    meaning: 'Same as P0299: Manifold boost pressure failed to meet ECU target pressure.',
    causes: [
      'Split boost hose or intercooler leak',
      'Failing N75 boost solenoid valve',
      'Sticky turbo VNT vanes or damaged vacuum lines'
    ],
    fixes: [
      'Inspect boost pipe joints and intercooler',
      'Test vacuum lines feeding turbo actuator',
      'Test N75 valve and vacuum pump output'
    ],
    severity: 'danger'
  },
  'P0401': {
    code: 'P0401',
    vagCode: '01025',
    title: 'Exhaust Gas Recirculation (EGR) Flow Insufficient',
    system: 'Emissions & EGR System',
    meaning: 'MAF sensor does not detect the expected drop in fresh air flow when the EGR valve is commanded open.',
    causes: [
      'Carbon build-up clogging EGR valve, inlet manifold, or EGR cooler pipe',
      'Failed electronic EGR motor or stripped plastic gears inside actuator',
      'Split EGR cooler'
    ],
    fixes: [
      'Remove and chemically clean EGR valve and intake manifold tract',
      'Inspect internal gears of electric EGR valve actuator for stripped teeth',
      'Perform EGR Adaptation / Basic Setting with diagnostic tool'
    ],
    severity: 'warning'
  },
  'P2015': {
    code: 'P2015',
    vagCode: '08213',
    title: 'Intake Manifold Flap Position Sensor (Bank 1)',
    system: 'Induction & Swirl Flaps',
    meaning: 'The swirl flap motor rotated beyond its calibrated physical end stop.',
    causes: [
      'Extremely common on 2.0 TDI: worn plastic mechanical end stop on intake manifold flap arm allows motor to over-rotate',
      'Carbon buildup on swirl flaps'
    ],
    fixes: [
      'Install a CNC aluminum P2015 repair bracket (widely available fix) that restores the factory mechanical stop limit without replacing the entire intake manifold',
      'Clear DTCs after fitting stop bracket'
    ],
    severity: 'warning'
  },
  'P2452': {
    code: 'P2452',
    vagCode: '09298',
    title: 'DPF Differential Pressure Sensor (G450) Circuit',
    system: 'Exhaust & DPF System',
    meaning: 'Electrical fault in DPF differential pressure sensor G450 measuring pressure before and after the particle filter.',
    causes: [
      'Failed G450 differential pressure sensor (very common failure part)',
      'Cracked or melted silicone rubber pressure sensing pipes leading from exhaust to sensor',
      'Sensor wiring plug corroded'
    ],
    fixes: [
      'Inspect the two silicone pressure pipes running up from exhaust to the G450 sensor on the firewall for heat damage or splits',
      'Replace G450 sensor (ensure genuine OEM replacement)',
      'Perform DPF Differential Pressure Sensor Adaptation after replacement'
    ],
    severity: 'danger'
  },
  'P2463': {
    code: 'P2463',
    vagCode: '09315',
    title: 'Diesel Particulate Filter - Soot Accumulation',
    system: 'Exhaust & DPF System',
    meaning: 'Calculated or measured soot mass in the DPF has exceeded the maximum permissible threshold for normal regeneration.',
    causes: [
      'Repeated short urban drive cycles preventing active regeneration conditions',
      'Underlying engine fault (faulty thermostat preventing engine reaching 85°C, failed glow plug, boost leak)',
      'Faulty DPF differential pressure sensor reporting incorrect soot load'
    ],
    fixes: [
      'Fix any underlying engine/glow-plug/thermostat faults first (active regen requires coolant > 75°C, fuel > 10L, no engine codes)',
      'Take vehicle on an extended 30-minute motorway drive at steady 2000-2500 RPM in 4th/5th gear',
      'Initiate an emergency Service Regeneration if soot mass is within safe limits (< 45g)'
    ],
    severity: 'danger'
  },
  'P0101': {
    code: 'P0101',
    title: 'Mass or Volume Air Flow (MAF) Circuit Range/Performance',
    system: 'Fuel & Air Metering',
    meaning: 'MAF sensor G70 readings conflict with engine RPM, throttle angle, and boost pressure calculations.',
    causes: [
      'Dirty or oil-contaminated MAF hot-film element',
      'Air leak / unmetered air entering between MAF and turbo inlet',
      'Blocked engine air filter'
    ],
    fixes: [
      'Inspect air intake pipe for splits between MAF sensor and turbocharger',
      'Clean MAF sensor with dedicated MAF cleaner spray (do not touch element with fingers/tools)',
      'Replace air filter element'
    ],
    severity: 'warning'
  },
  'P0300': {
    code: 'P0300',
    title: 'Random / Multiple Cylinder Misfire Detected',
    system: 'Ignition & Fuel Delivery',
    meaning: 'Engine crankshaft acceleration sensors detected combustion misfires across multiple cylinders.',
    causes: [
      'Worn spark plugs or failing ignition coil packs (petrol engines)',
      'Fuel injector clogging or low fuel rail pressure',
      'Intake vacuum leak / PCV valve diaphragm failure'
    ],
    fixes: [
      'Inspect spark plugs and swap ignition coils to trace cylinder-specific fault',
      'Inspect PCV crankcase breather valve for tears',
      'Check fuel pressure and injector balance'
    ],
    severity: 'danger'
  }
};

/**
 * Standardize and lookup DTC code with failure symptom decoding
 * 
 * @param {string|number} rawCode - e.g. "01117", 1117, "P0299", "0x045D", "0x123456"
 * @param {number|string} [statusByte] - UDS status byte or KWP status
 * @param {number|string} [symptomByte] - Failure Type Byte (FTB), e.g. 0x08, 0x02, 33
 * @returns {object} Structured DTC knowledge object
 */
export function lookupDtc(rawCode, statusByte = null, symptomByte = null) {
  let normalized = String(rawCode || '').trim().toUpperCase();
  let vagDecCode = null;

  // Handle hex string inputs: e.g. "0X045D" -> decimal 1117 -> "01117"
  if (normalized.startsWith('0X')) {
    const hexNum = parseInt(normalized.substring(2), 16);
    if (!isNaN(hexNum)) {
      // 16-bit KWP code
      if (hexNum <= 0xFFFF) {
        vagDecCode = hexNum.toString().padStart(5, '0');
      }
    }
  } else if (/^\d{1,5}$/.test(normalized)) {
    vagDecCode = normalized.padStart(5, '0');
  }

  // Lookup priority:
  // 1. Exact match (e.g. "P0299", "01117")
  // 2. VAG 5-digit decimal match
  let record = DTC_KNOWLEDGE_BASE[normalized] || (vagDecCode ? DTC_KNOWLEDGE_BASE[vagDecCode] : null);

  // Decode Symptom
  let symptomInfo = null;
  if (symptomByte !== null && symptomByte !== undefined) {
    let symKey = String(symptomByte).trim();
    if (typeof symptomByte === 'number') {
      symKey = symptomByte.toString().padStart(3, '0');
    } else if (symKey.startsWith('0x') || symKey.startsWith('0X')) {
      const symNum = parseInt(symKey.substring(2), 16);
      symKey = symNum.toString().padStart(3, '0');
    }
    symptomInfo = VAG_SYMPTOM_CODES[symKey] || VAG_SYMPTOM_CODES[String(parseInt(symKey, 10))];
  }

  // Fallback for unknown codes
  const displayCode = vagDecCode || normalized;
  const isPCode = displayCode.startsWith('P');

  let defaultSystem = 'General Vehicle System';
  if (isPCode) defaultSystem = 'Powertrain & Emissions';
  else if (displayCode.startsWith('0058') || displayCode.startsWith('0121')) defaultSystem = 'SRS Airbag System';
  else if (displayCode.startsWith('0028') || displayCode.startsWith('01316')) defaultSystem = 'Brakes & ABS';
  else if (displayCode.startsWith('0111') || displayCode.startsWith('0159')) defaultSystem = 'Electrical & Charging';

  return {
    code: displayCode,
    vagCode: record?.vagCode || (isPCode ? null : displayCode),
    title: record?.title || (isPCode ? `Standard Diagnostic Trouble Code ${displayCode}` : `VAG Fault Code ${displayCode}`),
    system: record?.system || defaultSystem,
    meaning: record?.meaning || `The electronic control unit has recorded fault code ${displayCode}. Check factory repair manuals for detailed pinout tests.`,
    causes: record?.causes || [
      'Faulty sensor or actuator circuit',
      'Wiring harness damage, short circuit, or loose connector pin',
      'Intermittent low battery voltage condition',
      'Mechanical wear or maladjustment'
    ],
    fixes: record?.fixes || [
      'Inspect electrical connectors and wiring harness for the associated component',
      'Check system live data measuring blocks to verify sensor response',
      'Clear fault code and test-drive vehicle to confirm if the condition is static or intermittent'
    ],
    severity: record?.severity || 'warning',
    symptom: symptomInfo?.label || null,
    symptomDetail: symptomInfo?.description || null,
    statusByte: statusByte !== null ? (typeof statusByte === 'number' ? `0x${statusByte.toString(16).padStart(2, '0').toUpperCase()}` : String(statusByte)) : null,
    isKnown: !!record
  };
}
