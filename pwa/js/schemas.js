// Bundled VAG Vehicle Platform Definitions for vibesODB2
export const BUNDLED_SCHEMAS = {
  "mqb_bcm_0x09": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "MQB",
    "chassis_codes": [
      "5G",
      "BA",
      "AU",
      "8V",
      "5F",
      "5E",
      "3G",
      "AD",
      "BW",
      "7L",
      "NS",
      "KH"
    ],
    "module_address": "0x09",
    "tx_header": "70E",
    "rx_filter": "778",
    "coding_did": "0x0600",
    "expected_byte_length": 30,
    "features": [
      {
        "id": "drl_standard_active",
        "category": "Daytime Running Lights",
        "byte": 11,
        "bit": 2,
        "name": "Daytime Running Lights (DRL) Active",
        "description": "Enables primary front daytime running lights operation in ignition ON position.",
        "prerequisites": null
      },
      {
        "id": "scandinavian_drl",
        "category": "Daytime Running Lights",
        "byte": 12,
        "bit": 0,
        "name": "Scandinavian DRL (Rear Tail Lights Active with DRL)",
        "description": "Keeps rear LED/bulb taillights illuminated together with front Daytime Running Lights during daylight.",
        "prerequisites": null
      },
      {
        "id": "drl_off_with_handbrake",
        "category": "Daytime Running Lights",
        "byte": 14,
        "bit": 1,
        "name": "Deactivate DRL when Electronic Parking Brake (EPB) Set",
        "description": "Switches off daytime running lights whenever vehicle is stationary with parking brake applied.",
        "prerequisites": null
      },
      {
        "id": "auto_lock_speed",
        "category": "Central Locking",
        "byte": 0,
        "bit": 4,
        "name": "Automatic Door Auto-Lock (>15 km/h)",
        "description": "Automatically locks all doors when driving speed exceeds 15 km/h for anti-carjacking protection.",
        "prerequisites": null
      },
      {
        "id": "auto_unlock_key_removal",
        "category": "Central Locking",
        "byte": 0,
        "bit": 5,
        "name": "Automatic Door Auto-Unlock on Key Removal",
        "description": "Automatically unlocks all doors when ignition key is extracted or engine Start/Stop turned off.",
        "prerequisites": null
      },
      {
        "id": "central_locking_remote_active",
        "category": "Central Locking",
        "byte": 2,
        "bit": 0,
        "name": "Radio Remote Keyless Central Locking Active",
        "description": "Enables wireless RF receiver processing for factory remote key fobs.",
        "prerequisites": null
      },
      {
        "id": "comfort_windows_remote",
        "category": "Mirrors & Convenience",
        "byte": 2,
        "bit": 2,
        "name": "Comfort Window Open / Close via Key Fob",
        "description": "Enables holding Lock/Unlock button on remote key fob to automatically roll all power windows up or down.",
        "prerequisites": "Power electric windows."
      },
      {
        "id": "sunroof_comfort_remote",
        "category": "Mirrors & Convenience",
        "byte": 2,
        "bit": 4,
        "name": "Panoramic Sunroof Comfort Open / Close via Key Fob",
        "description": "Enables opening and tilting panoramic electric glass sunroof together with comfort window operation.",
        "prerequisites": "Panoramic sunroof."
      },
      {
        "id": "passenger_mirror_dip_reverse",
        "category": "Mirrors & Convenience",
        "byte": 4,
        "bit": 0,
        "name": "Passenger Mirror Dip on Reverse Gear",
        "description": "Automatically angles passenger exterior mirror downward when reverse gear is engaged to assist kerb parking.",
        "prerequisites": "Power folding/memory exterior mirror motor."
      },
      {
        "id": "heated_exterior_mirrors",
        "category": "Mirrors & Convenience",
        "byte": 4,
        "bit": 6,
        "name": "Heated Exterior Mirrors Active with Defroster",
        "description": "Powers electric exterior mirror heating elements when heated rear windscreen defroster is switched on.",
        "prerequisites": "Heated exterior mirrors."
      },
      {
        "id": "optical_lock_ack",
        "category": "Locking Feedback",
        "byte": 1,
        "bit": 5,
        "name": "Turn Indicator Flash Acknowledgment on Lock",
        "description": "Flashes hazard/turn indicators once upon successful vehicle locking.",
        "prerequisites": null
      },
      {
        "id": "optical_unlock_ack",
        "category": "Locking Feedback",
        "byte": 1,
        "bit": 7,
        "name": "Turn Indicator Flash Acknowledgment on Unlock",
        "description": "Flashes hazard/turn indicators twice upon remote unlocking.",
        "prerequisites": null
      },
      {
        "id": "acoustic_lock_infotainment_menu",
        "category": "Locking Feedback",
        "byte": 1,
        "bit": 2,
        "name": "Acoustic Lock Confirmation (Infotainment Menu)",
        "description": "Enables lock/unlock acoustic beep setting inside the MIB / Discover Media vehicle settings menu.",
        "prerequisites": "Factory alarm siren."
      },
      {
        "id": "cornering_lights_via_fogs",
        "category": "Exterior Lighting",
        "byte": 12,
        "bit": 4,
        "name": "Dynamic Cornering Lights via Fog Lamps",
        "description": "Fades fog lamp on and off smoothly during cornering maneuvers or indicator usage.",
        "prerequisites": "Front fog lamps."
      },
      {
        "id": "front_fog_lights_installed",
        "category": "Exterior Lighting",
        "byte": 10,
        "bit": 0,
        "name": "Front Fog Lamps Installed",
        "description": "Enables BCM output stage circuitry for front halogen/LED fog light assemblies.",
        "prerequisites": "Front fog lamps."
      },
      {
        "id": "rear_fog_light_installed",
        "category": "Exterior Lighting",
        "byte": 10,
        "bit": 1,
        "name": "Rear Fog Lamp Installed",
        "description": "Enables BCM output stage circuitry for high-intensity rear fog safety lamp.",
        "prerequisites": null
      },
      {
        "id": "coming_home_fog_lights",
        "category": "Exterior Lighting",
        "byte": 10,
        "bit": 2,
        "name": "Coming Home / Leaving Home with Fog Lights",
        "description": "Uses fog lights instead of xenon/LED low beams for Coming Home lighting to extend bulb life.",
        "prerequisites": "Front fog lamps."
      },
      {
        "id": "comfort_turn_signals_5_flashes",
        "category": "Exterior Lighting",
        "byte": 17,
        "bit": 3,
        "name": "Highway Comfort Turn Signals",
        "description": "Cycles indicator flash pulses upon soft touch of indicator stalk.",
        "prerequisites": null
      },
      {
        "id": "teardrop_wipe_front",
        "category": "Wipers & Washers",
        "byte": 3,
        "bit": 4,
        "name": "Front Windscreen Teardrop Wipe",
        "description": "Performs one delayed wipe across front screen 5 seconds after screenwash spray.",
        "prerequisites": null
      },
      {
        "id": "rear_window_wiper_installed",
        "category": "Wipers & Washers",
        "byte": 14,
        "bit": 0,
        "name": "Rear Window Wiper Installed",
        "description": "Enables rear tailgate wiper motor output driver and stalk intermittent control.",
        "prerequisites": "Rear wiper."
      },
      {
        "id": "rear_wiper_reverse_sync",
        "category": "Wipers & Washers",
        "byte": 14,
        "bit": 4,
        "name": "Rear Wiper on Reverse Gear Sync",
        "description": "Automatically runs rear wiper when selecting reverse gear if front wipers are active.",
        "prerequisites": "Rear wiper."
      },
      {
        "id": "heated_rear_window_installed",
        "category": "Wipers & Washers",
        "byte": 9,
        "bit": 0,
        "name": "Heated Rear Defrost Window Installed",
        "description": "Controls high-current relay driver for rear windscreen heating grid.",
        "prerequisites": null
      },
      {
        "id": "footwell_ambient_lighting",
        "category": "Interior Lighting",
        "byte": 5,
        "bit": 7,
        "name": "Interior Footwell Lighting Installed",
        "description": "Enables LED/bulb footwell illumination with door open and dimmable ambient drive lighting.",
        "prerequisites": "Footwell LED units."
      }
    ]
  },
  "mqb_cluster_0x17": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "MQB",
    "chassis_codes": [
      "5G",
      "BA",
      "AU",
      "8V",
      "5F",
      "5E",
      "3G",
      "AD",
      "BW",
      "7L",
      "NS",
      "KH"
    ],
    "module_address": "0x17",
    "tx_header": "714",
    "rx_filter": "77E",
    "coding_did": "0x0600",
    "expected_byte_length": 3,
    "features": [
      {
        "id": "gauge_staging_needle_sweep",
        "category": "Gauges & Display",
        "byte": 1,
        "bit": 0,
        "name": "Gauge Needle Sweep (Staging / Celebration)",
        "description": "Sweeps speedometer and tachometer needles from min to max and back upon ignition activation.",
        "prerequisites": "Supported instrument cluster revision (Analog & Active Info Display)."
      },
      {
        "id": "lap_timer_active",
        "category": "Gauges & Display",
        "byte": 1,
        "bit": 3,
        "name": "Lap Timer & Oil Temperature Menu",
        "description": "Activates the track lap timer and dedicated engine oil temperature telemetry screen in cluster MFA.",
        "prerequisites": "Color MFA or Virtual Cockpit."
      },
      {
        "id": "refuel_quantity_display",
        "category": "Gauges & Display",
        "byte": 2,
        "bit": 2,
        "name": "Refuel Volume Display (Quantity to Add)",
        "description": "Displays the exact liters/gallons needed to fill fuel tank to capacity in 5-liter increments.",
        "prerequisites": null
      },
      {
        "id": "seatbelt_chime_warning",
        "category": "Warnings & Chimes",
        "byte": 1,
        "bit": 1,
        "name": "Seatbelt Acoustic Warning Chime",
        "description": "Sounds audible chime when driver or passenger seatbelts are unbuckled with vehicle in motion.",
        "prerequisites": null
      }
    ]
  },
  "pq25_bcm_0x09": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "PQ25_T51",
    "chassis_codes": [
      "7E",
      "7F",
      "7H",
      "7J",
      "6R",
      "6C",
      "6J",
      "5J"
    ],
    "module_address": "0x09",
    "tx_header": "70E",
    "rx_filter": "778",
    "coding_did": "0x0600",
    "expected_byte_length": 30,
    "features": [
      {
        "id": "selective_central_locking",
        "category": "Central Locking",
        "byte": 0,
        "bit": 0,
        "name": "Selective Door Unlocking (Single Door)",
        "description": "First press of remote key fob unlocks driver door only; second press unlocks all doors.",
        "prerequisites": null
      },
      {
        "id": "auto_lock_15kmh",
        "category": "Central Locking",
        "byte": 0,
        "bit": 1,
        "name": "Speed-Dependent Auto Locking (>15 km/h)",
        "description": "Automatically locks all passenger and cargo doors when vehicle speed exceeds 15 km/h (anti-carjacking).",
        "prerequisites": null
      },
      {
        "id": "auto_unlock_key_removal",
        "category": "Central Locking",
        "byte": 0,
        "bit": 2,
        "name": "Auto-Unlock on Key Removal",
        "description": "Automatically unlocks all doors when the mechanical ignition key is withdrawn from the barrel.",
        "prerequisites": null
      },
      {
        "id": "central_locking_remote_active",
        "category": "Central Locking",
        "byte": 0,
        "bit": 5,
        "name": "Central Locking Remote Control Active",
        "description": "Enables wireless RF receiver processing for factory remote key fobs.",
        "prerequisites": null
      },
      {
        "id": "acoustic_lock_chirp",
        "category": "Locking Feedback",
        "byte": 1,
        "bit": 2,
        "name": "Acoustic Lock Confirmation",
        "description": "Sounds brief alarm siren chirp when all vehicle doors and tailgate are securely locked.",
        "prerequisites": "OEM alarm siren installed."
      },
      {
        "id": "optical_lock_flash",
        "category": "Locking Feedback",
        "byte": 1,
        "bit": 5,
        "name": "Optical Confirmation on Locking",
        "description": "Flashes hazard/turn indicators once upon successful vehicle locking.",
        "prerequisites": null
      },
      {
        "id": "optical_unlock_flash",
        "category": "Locking Feedback",
        "byte": 1,
        "bit": 7,
        "name": "Optical Confirmation on Unlocking",
        "description": "Flashes hazard/turn indicators twice upon remote unlocking.",
        "prerequisites": null
      },
      {
        "id": "anti_theft_siren_installed",
        "category": "Security & Alarm",
        "byte": 2,
        "bit": 4,
        "name": "Anti-Theft Alarm Siren Installed",
        "description": "Enables LIN-bus communication with the internal battery-backed alarm sounder (H12).",
        "prerequisites": "Physical alarm sounder hardware."
      },
      {
        "id": "comfort_windows_remote",
        "category": "Windows & Convenience",
        "byte": 3,
        "bit": 0,
        "name": "Comfort Window Operation via Remote Key",
        "description": "Allows opening and closing electric power windows by holding the remote key fob buttons.",
        "prerequisites": "Power electric front windows."
      },
      {
        "id": "teardrop_wipe_front",
        "category": "Wipers & Washers",
        "byte": 3,
        "bit": 4,
        "name": "Front Windscreen Teardrop Wipe",
        "description": "Performs one delayed wipe across the front windscreen 5 seconds after washing to clear fluid runoff.",
        "prerequisites": null
      },
      {
        "id": "rear_wiper_installed",
        "category": "Wipers & Washers",
        "byte": 3,
        "bit": 7,
        "name": "Rear Window Wiper Installed",
        "description": "Enables power feed and stalk control for tailgate rear wiper motor.",
        "prerequisites": "Tailgate rear wiper equipped."
      },
      {
        "id": "heated_mirror_defogger_sync",
        "category": "Windows & Convenience",
        "byte": 4,
        "bit": 0,
        "name": "Heated Mirrors Synced with Rear Defogger",
        "description": "Automatically activates exterior heated door mirrors when the rear window defogger switch is engaged.",
        "prerequisites": "Heated mirror glass equipped."
      },
      {
        "id": "rain_closing_windows",
        "category": "Windows & Convenience",
        "byte": 4,
        "bit": 5,
        "name": "Rain-Closing Windows",
        "description": "Automatically winds up open windows if rain is sensed while vehicle is locked and parked.",
        "prerequisites": "Rain/Light sensor (RLS) installed."
      },
      {
        "id": "drl_active",
        "category": "Daytime Running Lights",
        "byte": 8,
        "bit": 0,
        "name": "Daytime Running Lights (DRL) Active",
        "description": "Master switch enabling dedicated daytime running lamps when ignition is switched ON.",
        "prerequisites": null
      },
      {
        "id": "drl_selectable_in_mfa",
        "category": "Daytime Running Lights",
        "byte": 8,
        "bit": 1,
        "name": "DRL Toggle in Cluster Display (MFA)",
        "description": "Adds Daytime Running Lights ON/OFF checkbox to the Instrument Cluster multifunction display menu.",
        "prerequisites": "Highline / MFA+ instrument cluster."
      },
      {
        "id": "headlight_washers_installed",
        "category": "Wipers & Washers",
        "byte": 9,
        "bit": 0,
        "name": "Headlight Washer System Installed (SRA)",
        "description": "Enables high-pressure bumper headlight washer pump activation every 5 windscreen wash cycles.",
        "prerequisites": "Headlight washer pump and bumper jets."
      },
      {
        "id": "leaving_home_active",
        "category": "Exterior Lighting",
        "byte": 10,
        "bit": 1,
        "name": "Leaving Home Illumination",
        "description": "Illuminates headlights/sidelights when vehicle is unlocked via remote key in the dark.",
        "prerequisites": "Rain/Light sensor with Auto headlight switch."
      },
      {
        "id": "coming_home_active",
        "category": "Exterior Lighting",
        "byte": 10,
        "bit": 2,
        "name": "Coming Home Illumination",
        "description": "Maintains exterior lighting after ignition is switched off to guide occupant to house.",
        "prerequisites": null
      },
      {
        "id": "drl_via_low_beam",
        "category": "Daytime Running Lights",
        "byte": 11,
        "bit": 0,
        "name": "DRL via Dipped Beam Headlights",
        "description": "Operates dipped low beam headlights as Daytime Running Lights (Scandinavian mode).",
        "prerequisites": null
      },
      {
        "id": "drl_via_fog_lights",
        "category": "Daytime Running Lights",
        "byte": 11,
        "bit": 2,
        "name": "DRL via Front Fog Lights (North America)",
        "description": "Illuminates front fog lamps as daytime running lights instead of main headlights.",
        "prerequisites": "Front fog lamps installed."
      },
      {
        "id": "cornering_fog_lights",
        "category": "Exterior Lighting",
        "byte": 12,
        "bit": 0,
        "name": "Dynamic Cornering Fog Lights",
        "description": "Illuminates the front fog lamp on the steered or indicated side during low-speed maneuvers (below 40 km/h).",
        "prerequisites": "Front fog lamps must be physically installed and wired."
      },
      {
        "id": "coming_home_flasher",
        "category": "Exterior Lighting",
        "byte": 12,
        "bit": 2,
        "name": "Coming Home (Stalk Triggered)",
        "description": "Activates Coming Home lighting for 30 seconds upon pulling high-beam flash stalk after ignition OFF.",
        "prerequisites": null
      },
      {
        "id": "parking_lights_single_side",
        "category": "Exterior Lighting",
        "byte": 13,
        "bit": 0,
        "name": "Single-Side Parking Lights",
        "description": "Illuminates side lights on the chosen side when turn indicator stalk is left up/down with ignition off.",
        "prerequisites": null
      },
      {
        "id": "drl_handbrake_off",
        "category": "Daytime Running Lights",
        "byte": 14,
        "bit": 1,
        "name": "Deactivate DRL with Parking Brake",
        "description": "Shuts off daytime running lamps whenever the mechanical handbrake lever is engaged.",
        "prerequisites": null
      },
      {
        "id": "rear_wipe_reverse",
        "category": "Wipers & Washers",
        "byte": 14,
        "bit": 4,
        "name": "Rear Wiper on Reverse Gear",
        "description": "Automatically sweeps rear window wiper once when reverse gear is engaged with front wipers active.",
        "prerequisites": "Rear wiper must be physically equipped."
      },
      {
        "id": "emergency_brake_flash",
        "category": "Exterior Lighting",
        "byte": 16,
        "bit": 1,
        "name": "Emergency Brake Hazard Flashing",
        "description": "Automatically pulses hazard warning flashers rapidly during severe deceleration or ABS intervention.",
        "prerequisites": null
      },
      {
        "id": "emergency_brake_light_flash",
        "category": "Exterior Lighting",
        "byte": 16,
        "bit": 2,
        "name": "Emergency Brake Light Flashing",
        "description": "Rapidly flashes rear brake lights under heavy threshold braking.",
        "prerequisites": null
      },
      {
        "id": "comfort_turn_signals",
        "category": "Exterior Lighting",
        "byte": 17,
        "bit": 3,
        "name": "Highway Comfort Turn Signals",
        "description": "Flashing cycle pulses 3 times when the turn indicator stalk is lightly tapped.",
        "prerequisites": null
      },
      {
        "id": "front_fog_lights_installed",
        "category": "Exterior Lighting",
        "byte": 21,
        "bit": 0,
        "name": "Front Fog Lights Installed",
        "description": "Registers physical front fog lamp wiring and light switch front fog position.",
        "prerequisites": "Front fog lamps."
      },
      {
        "id": "footwell_lights_installed",
        "category": "Interior Lighting",
        "byte": 23,
        "bit": 2,
        "name": "Footwell Interior Lighting Installed",
        "description": "Enables ambient driver and passenger footwell lighting circuits upon door opening.",
        "prerequisites": "Footwell lamp wiring."
      }
    ]
  },
  "pq25_climatronic_0x08": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "PQ25_T51",
    "chassis_codes": [
      "7E",
      "7F",
      "7H"
    ],
    "module_address": "0x08",
    "tx_header": "746",
    "rx_filter": "7B0",
    "coding_did": "0x0600",
    "expected_byte_length": 4,
    "features": [
      {
        "id": "recirculation_memory",
        "category": "Air Conditioning",
        "byte": 0,
        "bit": 2,
        "name": "Air Recirculation Memory State",
        "description": "Retains manual recirculated air setting between ignition cycles.",
        "prerequisites": null
      }
    ]
  },
  "pq25_cluster_0x17": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "PQ25_T51",
    "chassis_codes": [
      "7E",
      "7F",
      "7H"
    ],
    "module_address": "0x17",
    "tx_header": "714",
    "rx_filter": "77E",
    "coding_did": "0x0600",
    "expected_byte_length": 3,
    "features": [
      {
        "id": "needle_sweep_staging",
        "category": "Gauges & Display",
        "byte": 1,
        "bit": 0,
        "name": "Gauge Needle Sweep (Staging)",
        "description": "Sweeps speedometer and tachometer needles to maximum position and back upon turning ignition ON.",
        "prerequisites": "Supported instrument cluster revision (MFA+ / Highline)."
      },
      {
        "id": "seatbelt_chime_warning",
        "category": "Warnings & Chimes",
        "byte": 1,
        "bit": 1,
        "name": "Seatbelt Warning Acoustic Chime",
        "description": "Sounds audible chime when driver seatbelt is unbuckled with vehicle in motion.",
        "prerequisites": null
      }
    ]
  },
  "pq25_gateway_0x19": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "PQ25_T51",
    "chassis_codes": [
      "7E",
      "7F",
      "7H"
    ],
    "module_address": "0x19",
    "tx_header": "710",
    "rx_filter": "77A",
    "coding_did": "0x0600",
    "expected_byte_length": 6,
    "features": [
      {
        "id": "trailer_module_installed",
        "category": "Installation List",
        "byte": 3,
        "bit": 2,
        "name": "Trailer Detection Module (J345)",
        "description": "Enables CAN communication and lighting coordination for factory or aftermarket towbar module.",
        "prerequisites": "Physical towbar wiring kit installed."
      },
      {
        "id": "navigation_module_installed",
        "category": "Installation List",
        "byte": 2,
        "bit": 4,
        "name": "Navigation System (RNS/Discover)",
        "description": "Registers headunit navigation bus on Gateway installation table.",
        "prerequisites": null
      }
    ]
  },
  "pq25_pdc_0x10": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "PQ25_T51",
    "chassis_codes": [
      "7E",
      "7F",
      "7H"
    ],
    "module_address": "0x10",
    "tx_header": "734",
    "rx_filter": "79E",
    "coding_did": "0x0600",
    "expected_byte_length": 2,
    "features": [
      {
        "id": "optical_parking_system",
        "category": "Parking Aids",
        "byte": 0,
        "bit": 4,
        "name": "Optical Parking System (OPS) Display",
        "description": "Enables graphic visual proximity vehicle silhouette on headunit screen.",
        "prerequisites": "Compatible infotainment headunit."
      }
    ]
  },
  "pq35_bcm_0x09": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "PQ35",
    "chassis_codes": [
      "1K",
      "5K",
      "AJ",
      "2K",
      "2C",
      "1T",
      "5N",
      "13",
      "8P",
      "1P",
      "1Z",
      "3C",
      "36"
    ],
    "module_address": "0x09",
    "tx_header": "70E",
    "rx_filter": "778",
    "coding_did": "0x0600",
    "expected_byte_length": 30,
    "features": [
      {
        "id": "selective_central_locking",
        "category": "Central Locking",
        "byte": 0,
        "bit": 0,
        "name": "Selective Door Unlocking",
        "description": "First press unlocks driver door; second press unlocks passenger and boot doors.",
        "prerequisites": null
      },
      {
        "id": "auto_lock_15kmh",
        "category": "Central Locking",
        "byte": 0,
        "bit": 1,
        "name": "Auto-Locking (>15 km/h)",
        "description": "Automatically locks all doors once vehicle speed reaches 15 km/h.",
        "prerequisites": null
      },
      {
        "id": "auto_unlock_key_removal",
        "category": "Central Locking",
        "byte": 0,
        "bit": 2,
        "name": "Auto-Unlock on Key Removal",
        "description": "Unlocks vehicle doors automatically when ignition key is pulled from ignition barrel.",
        "prerequisites": null
      },
      {
        "id": "acoustic_lock_chirp",
        "category": "Locking Feedback",
        "byte": 1,
        "bit": 2,
        "name": "Acoustic Lock Confirmation (Horn/Siren Chirp)",
        "description": "Emits short acoustic chirp upon vehicle locking via remote fob.",
        "prerequisites": "Alarm siren installed."
      },
      {
        "id": "optical_lock_flash",
        "category": "Locking Feedback",
        "byte": 1,
        "bit": 5,
        "name": "Optical Indicator Blink on Lock",
        "description": "Flashes turn indicators once when vehicle is locked.",
        "prerequisites": null
      },
      {
        "id": "comfort_windows_remote",
        "category": "Windows & Convenience",
        "byte": 3,
        "bit": 0,
        "name": "Comfort Window Operation via Remote",
        "description": "Allows opening/closing windows by holding lock/unlock buttons on key fob.",
        "prerequisites": null
      },
      {
        "id": "teardrop_wipe_front",
        "category": "Wipers & Washers",
        "byte": 3,
        "bit": 4,
        "name": "Windscreen Teardrop Wiping",
        "description": "Executes one final wipe 5 seconds after screenwash spray.",
        "prerequisites": null
      },
      {
        "id": "rain_closing_windows",
        "category": "Windows & Convenience",
        "byte": 4,
        "bit": 5,
        "name": "Rain-Closing Windows & Sunroof",
        "description": "Automatically closes open windows and sunroof if rain is detected while vehicle is locked.",
        "prerequisites": "Rain/Light sensor equipped."
      },
      {
        "id": "coming_home_automatic",
        "category": "Exterior Lighting",
        "byte": 10,
        "bit": 1,
        "name": "Coming Home Automatic Mode",
        "description": "Coming Home lights trigger automatically on door open when dark without requiring stalk flash.",
        "prerequisites": "Rain/Light sensor with Auto headlight switch."
      },
      {
        "id": "leaving_home_active",
        "category": "Exterior Lighting",
        "byte": 10,
        "bit": 2,
        "name": "Leaving Home Illumination",
        "description": "Illuminates headlights upon remote unlocking at night.",
        "prerequisites": "Rain/Light sensor."
      },
      {
        "id": "drl_via_fog_lights",
        "category": "Daytime Running Lights",
        "byte": 11,
        "bit": 2,
        "name": "DRL via Front Fog Lights",
        "description": "Runs front fog lamps as Daytime Running Lights instead of main dipped beams.",
        "prerequisites": "Front fog lamps."
      },
      {
        "id": "cornering_fog_lights",
        "category": "Exterior Lighting",
        "byte": 12,
        "bit": 0,
        "name": "Dynamic Cornering Fog Lights",
        "description": "Turns on corresponding fog lamp when steering or indicating at low speed.",
        "prerequisites": "Front fog lamps."
      },
      {
        "id": "drl_handbrake_off",
        "category": "Daytime Running Lights",
        "byte": 14,
        "bit": 1,
        "name": "Deactivate DRL with Handbrake",
        "description": "Turns off daytime running lamps whenever parking brake is engaged.",
        "prerequisites": null
      },
      {
        "id": "rear_wipe_reverse",
        "category": "Wipers & Washers",
        "byte": 14,
        "bit": 4,
        "name": "Rear Wiper on Reverse Gear",
        "description": "Wipes rear window when reverse gear is selected with front wipers running.",
        "prerequisites": null
      },
      {
        "id": "emergency_brake_flash",
        "category": "Exterior Lighting",
        "byte": 16,
        "bit": 1,
        "name": "Emergency Brake Hazard Flashing",
        "description": "Flashes hazard lights under emergency deceleration.",
        "prerequisites": null
      },
      {
        "id": "comfort_turn_signals",
        "category": "Exterior Lighting",
        "byte": 17,
        "bit": 3,
        "name": "Highway Comfort Turn Signals (3 Flashes)",
        "description": "3 turn indicator flashes on light tap of stalk.",
        "prerequisites": null
      },
      {
        "id": "footwell_lights_installed",
        "category": "Interior Lighting",
        "byte": 20,
        "bit": 0,
        "name": "Footwell Ambient Lighting Active",
        "description": "Enables ambient footwell lighting circuit.",
        "prerequisites": "Footwell lights."
      }
    ]
  },
  "pq35_cluster_0x17": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "platform": "PQ35",
    "chassis_codes": [
      "1K",
      "5K",
      "AJ",
      "2K",
      "2C",
      "1T",
      "5N",
      "13",
      "8P",
      "1P",
      "1Z",
      "3C",
      "36"
    ],
    "module_address": "0x17",
    "tx_header": "714",
    "rx_filter": "77E",
    "coding_did": "0x0600",
    "expected_byte_length": 3,
    "features": [
      {
        "id": "needle_sweep_staging",
        "category": "Gauges & Display",
        "byte": 1,
        "bit": 0,
        "name": "Gauge Needle Sweep (Staging / Celebration)",
        "description": "Sweeps speedometer and tachometer needles from 0 to max and back upon turning ignition ON.",
        "prerequisites": "MFA+ / Highline cluster instrument revision."
      },
      {
        "id": "seatbelt_chime_warning",
        "category": "Warnings & Chimes",
        "byte": 1,
        "bit": 1,
        "name": "Seatbelt Acoustic Warning Chime",
        "description": "Audible chime sounding if driver seatbelt is not buckled above 20 km/h.",
        "prerequisites": null
      },
      {
        "id": "digital_speed_mfa",
        "category": "Gauges & Display",
        "byte": 2,
        "bit": 3,
        "name": "Large Digital Speed Display in MFA",
        "description": "Shows large digital speedometer reading on central instrument cluster display.",
        "prerequisites": "Highline multifunction display."
      }
    ]
  }
};

export function getBit(byteVal, bitIndex) {
    return (byteVal & (1 << bitIndex)) !== 0;
}

export function setBit(byteVal, bitIndex, value) {
    if (value) {
        return byteVal | (1 << bitIndex);
    } else {
        return byteVal & ~(1 << bitIndex);
    }
}

export function toggleBit(byteVal, bitIndex) {
    return byteVal ^ (1 << bitIndex);
}

export function hexStringToBytes(hexStr) {
    const cleaned = hexStr.replace(/\s+/g, "");
    const bytes = [];
    for (let i = 0; i < cleaned.length; i += 2) {
        bytes.push(parseInt(cleaned.substr(i, 2), 16));
    }
    return new Uint8Array(bytes);
}

export function bytesToHexString(byteArray) {
    return Array.from(byteArray)
        .map(b => b.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
}

export function computeByteDiff(origBytes, modBytes) {
    const diffs = [];
    const maxLen = Math.max(origBytes.length, modBytes.length);
    for (let i = 0; i < maxLen; i++) {
        const bOld = i < origBytes.length ? origBytes[i] : 0;
        const bNew = i < modBytes.length ? modBytes[i] : 0;
        if (bOld !== bNew) {
            const bitFlips = [];
            for (let bit = 0; bit < 8; bit++) {
                const oldBit = (bOld & (1 << bit)) !== 0;
                const newBit = (bNew & (1 << bit)) !== 0;
                if (oldBit !== newBit) {
                    bitFlips.push({ bit, oldVal: oldBit, newVal: newBit });
                }
            }
            diffs.push({
                byteIndex: i,
                oldHex: bOld.toString(16).padStart(2, "0").toUpperCase(),
                newHex: bNew.toString(16).padStart(2, "0").toUpperCase(),
                bitFlips
            });
        }
    }
    return diffs;
}
