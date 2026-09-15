# vibesODB2

### The free and open-source diagnostics & customization tool for VAG vehicles

> [!WARNING]
> **ALPHA SOFTWARE — HARDWARE & VEHICLE VERIFICATION REQUIRED**
> vibesODB2 is currently in early **Alpha**. While automated backups and safety checks are built in, writing settings to vehicle computers carries risk. Real-world testing across different car models and adapters is ongoing. Always make sure your battery is in good health and keep your ignition ON (engine OFF) when changing settings. Use at your own risk.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: VAG PQ25 / PQ35 / MQB](https://img.shields.io/badge/Platforms-Volkswagen%20%7C%20Audi%20%7C%20SEAT%20%7C%20%C5%A0koda-green.svg)](#-supported-vehicles)
[![GitHub Pages](https://img.shields.io/badge/Live%20App-Launch%20vibesODB2-success?logo=github)](https://orviwan.github.io/vibesODB2/)
[![Technical Docs](https://img.shields.io/badge/Docs-Advanced%20Guide-blue.svg)](ADVANCED.md)

**vibesODB2** is a free, zero-install vehicle diagnostic and tweak tool designed for **Volkswagen, Audi, SEAT, and Škoda** vehicles.

* 🚫 **No subscription fees or paywalled credits.**
* 🔌 **No expensive proprietary dongles** — works with standard Bluetooth OBD-II adapters.
* 📱 **Zero installation** — runs straight in your phone or laptop browser via Bluetooth.

---

## 🚀 Launch the App

👉 [**Open vibesODB2 (https://orviwan.github.io/vibesODB2/)**](https://orviwan.github.io/vibesODB2/)

| Live Digital Dashboard | Feature Tweaks (Coding) | Byte Matrix & Inspector | Safety Backups & Restores |
| :---: | :---: | :---: | :---: |
| <img src="docs/images/pwa_mobile_cockpit.png" width="220" /> | <img src="docs/images/pwa_mobile_coding.png" width="220" /> | <img src="docs/images/pwa_mobile_matrix.png" width="220" /> | <img src="docs/images/pwa_mobile_safety_modal.png" width="220" /> |

---

## ✨ What Can You Do with vibesODB2?

### 🏎️ 1. Live Digital Dashboard (Virtual Cockpit)
Stream real-time driving gauges on your mounted phone:
* Digital speedometer (km/h & mph) and tachometer with redline warnings.
* Turbo boost gauge (bar & PSI), throttle position, and DSG gear indicator.
* Thermal gauges (Coolant temperature, Intake Air temp, Turbo exhaust gas temp).
* Diesel Particulate Filter (DPF) soot mass loading and fuel rail pressure.
* Screen wake lock keeps your phone display awake while driving.

### ⚡ 2. One-Tap Feature Tweaks (Long Coding)
Customize your car's features using friendly toggle switches:
* **Gauge Needle Sweep / Staging**: Needles sweep to max on ignition startup.
* **Acoustic Lock Chirp**: Quick alarm chirp confirmation when locking.
* **Speed-Dependent Auto-Lock**: Automatically lock doors over 15 km/h.
* **Tear Wiping / Rain Functions**: Extra final wipe after windscreen washers.
* **Mirror Dip on Reverse Gear**: Automatically tilts the passenger mirror down when reversing.
* **Cornering Fog Lights**: Illuminates the fog light in the direction you turn.

### 🛡️ 3. Automatic Backups & One-Click Undo
Never worry about losing your original settings:
* Automatically saves an immutable snapshot before any setting is written.
* **Backup Explorer**: View byte-by-byte differences between your snapshots and active settings.
* One-tap restore gets you back to your factory baseline instantly.

### 🔍 4. Fault Code Scanner (DTCs)
* Read active and pending Diagnostic Trouble Codes across vehicle modules.
* Clear fault codes and reset warning lights (engine, ABS, airbag, convenience systems) after maintenance.

### 🚗 5. Vehicle & ECU Identification
* Auto-decodes your 17-digit VIN to show your exact vehicle model, model year, and factory assembly plant.
* Reads ECU hardware part numbers, software version numbers, and serial numbers.

---

## 🚗 Supported Vehicles

vibesODB2 supports modern Volkswagen Auto Group (VAG) vehicles across the **PQ25**, **PQ35**, **PQ46**, and **MQB** platforms:

| Make | Supported Models | Years |
| :--- | :--- | :--- |
| **Volkswagen** | **Golf** (Mk5, Mk6, Mk7, Mk7.5, Alltrack) | 2004–2020 |
| **Volkswagen** | **Transporter** (T5.1, T6, T6.1 Caravelle / Multivan) | 2010–2024 |
| **Volkswagen** | **Polo** (Mk5 6R / 6C) | 2009–2017 |
| **Volkswagen** | **Caddy** (Mk3, Mk4) | 2004–2020 |
| **Volkswagen** | **Passat** (B6, B7, B8, CC) | 2005–2023 |
| **Volkswagen** | **Tiguan** (Mk1, Mk2) & **Touran** | 2003–2023 |
| **Volkswagen** | **Scirocco** (Mk3) | 2008–2017 |
| **Audi** | **A3 / S3 / RS3** (8P, 8V) | 2003–2020 |
| **SEAT** | **Leon** (Mk2, Mk3) & **Ibiza** (Mk4) | 2005–2020 |
| **Škoda** | **Octavia** (Mk2, Mk3) & **Fabia** (Mk2) | 2004–2020 |

---

## 🔌 What Hardware Do I Need?

You just need an inexpensive, standard Bluetooth OBD-II adapter with BLE 4.0 support:

* 🥇 **Recommended**: **Vgate vLinker MC+** (Bluetooth 4.0 BLE / works on Android & iOS)
* **Also Compatible**: **OBDLink MX+**, **OBDLink CX**, or other standard BLE OBD-II dongles.

*(Note: Cheap generic blue ELM327 clone adapters with 64-byte buffers are not recommended for coding due to packet drop risks).*

---

## 📱 How to Get Started in 3 Steps

1. **Plug in the Adapter**: Plug your Bluetooth OBD-II dongle into your car's diagnostic port (usually located under the steering wheel area).
2. **Turn Ignition ON**: Turn your car key to position 2 (Ignition ON, engine OFF for coding).
3. **Connect**: Open [**https://orviwan.github.io/vibesODB2/**](https://orviwan.github.io/vibesODB2/) on your phone and tap **Connect BLE**:
   - **Android & PC / Mac**: Works directly in **Google Chrome**, **Microsoft Edge**, and **Brave**.
   - **iPhone & iPad**: Open the web link inside [**Bluefy – Web BLE Browser**](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) (free on the iOS App Store) because Safari restricts Bluetooth.

---

## 🤝 Sharing New Features with the Community

Discovered a new tweak or feature on your car?
1. Try your setting using the **"Add Custom Setting"** button in the app.
2. Verify that it works on your car.
3. Click **"Export Schema"** to save your custom definition file.
4. Share it with the community on GitHub so other drivers and mechanics can use it!

---

## 🛠️ Developers & Technical Documentation

Looking for protocol specifications (ISO 14229 UDS, ISO 15765-2 ISO-TP), Python CLI commands (`vibesodb2`), multi-rate telemetry math, architecture diagrams, or the test suite?

👉 **Read the [Advanced Developer Guide (ADVANCED.md)](ADVANCED.md)**

---

## 📄 Legal & Safety Disclaimer

* vibesODB2 is an independent open-source project and is **not** affiliated, endorsed, or associated with Volkswagen AG, Ross-Tech LLC, or any of their subsidiaries.
* All trademarks and model names are used strictly for reference under fair use and Right to Repair principles.
* Modifying vehicle parameters can alter vehicle lighting, warning systems, or convenience operations. The developers assume no responsibility for damage or issues resulting from the use of this software. Always test modifications responsibly.

---

## 📜 License

Distributed under the **MIT License**. See `LICENSE` for details.
