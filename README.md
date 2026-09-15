# vibesODB2

### The free and open source diagnostics & customization for VAG vehicles

> [!WARNING]
> **ALPHA SOFTWARE — HARDWARE & VEHICLE VERIFICATION REQUIRED**
> vibesODB2 is currently in early **Alpha**. While extensive defensive safety checks, engine-running interlocks, and automated pre-write snapshots are built in, writing to automotive Electronic Control Units (ECUs) carries inherent risks. Real-world testing and validation across different VAG platforms, models, and adapter firmwares are actively ongoing. Always verify existing backups before applying coding changes. Use at your own risk.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Platform: VAG PQ25 / PQ35 / MQB](https://img.shields.io/badge/Platforms-PQ25%20%7C%20PQ35%20%7C%20MQB-green.svg)](#supported-vag-platforms--chassis-matrix)
[![GitHub Pages](https://img.shields.io/badge/Live%20PWA-orviwan.github.io%2FvibesODB2-success?logo=github)](https://orviwan.github.io/vibesODB2/)
[![Built with AI](https://img.shields.io/badge/Built%20with-Agentic%20AI%20(Google%20Antigravity)-purple.svg)](#built-with-ai)

An open-source, modular vehicle configuration, diagnostic, and real-time telemetry engine engineered for **VAG platforms (PQ25, PQ35/PQ46, MQB)** across **Volkswagen, Audi, SEAT, and Škoda**.

Available as a zero-install **Progressive Web App (PWA)** running directly in mobile and desktop browsers via **Web Bluetooth**, accompanied by a **Python CLI & Automated Test Suite** for developer scripting and headless diagnostics.

---

## 📱 Live Progressive Web App (PWA)

🚀 **Launch App:** [**https://orviwan.github.io/vibesODB2/**](https://orviwan.github.io/vibesODB2/)

vibesODB2 runs directly in your mobile browser without compiling or installing an app store binary. Connect directly to your BLE OBD-II adapter using the browser's native Bluetooth stack:

| Virtual Cockpit | Feature Coding | Byte Matrix | Safety Guardrails |
| :---: | :---: | :---: | :---: |
| <img src="docs/images/pwa_mobile_cockpit.png" width="220" /> | <img src="docs/images/pwa_mobile_coding.png" width="220" /> | <img src="docs/images/pwa_mobile_matrix.png" width="220" /> | <img src="docs/images/pwa_mobile_safety_modal.png" width="220" /> |

### Browser & Hardware Compatibility:
- **Android**: Supported natively in Google Chrome, Microsoft Edge, Brave, and Samsung Internet via standard `navigator.bluetooth`.
- **iOS / iPadOS**: Apple Mobile Safari restricts Web Bluetooth. Open **`https://orviwan.github.io/vibesODB2/`** in [**Bluefy – Web BLE Browser**](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055) (free on the App Store), which provides full `navigator.bluetooth` standard support.
- **Laptops / Desktops**: Google Chrome, Edge, and Chromium with Bluetooth 4.0+.
- **Offline / Vehicle Use**: Installable as a standalone PWA on your home screen with full offline caching via Service Worker (`sw.js`).
- **Screen Wake Lock & Haptic Feedback**: Keeps your display on during drive diagnostics via `navigator.wakeLock`, and provides tactile vibration alerts on redline (>4800 RPM) or thermal peaks.

---

## Built with AI

> [!NOTE]
> **Engineering Methodology**
> vibesODB2 was designed, architected, and engineered using **Advanced Agentic AI Pair Programming** powered by **Google Antigravity**.
>
> Modern automotive scan tools often suffer from vendor lock-in, subscription paywalls, and proprietary diagnostic databases that hinder the Right-to-Repair movement. By applying autonomous coding agents to standard automotive communication protocols (ISO 14229 UDS, ISO 15765-2 ISO-TP, and ELM/STN serial abstraction), vibesODB2 achieves:
> - **Open Community Schemas**: Transparent, human-readable bitfield mappings decoupled from closed-source proprietary databases.
> - **Defensive Safety Architecture**: 5-point safety pipelines, pre-write snapshots, and atomic rollbacks.
> - **Extensible Community Ecosystem**: Add your own custom feature findings and export them with one click to share with the community.

---

## Architecture Overview

vibesODB2 uses a decoupled architecture separating the communication engine from the human-readable vehicle definitions:

```
+-------------------------------------------------------------------------+
|                        Application Layer (PWA & CLI)                    |
|       - Progressive Web App (PWA): https://orviwan.github.io/vibesODB2/ |
|       - Unified Developer CLI: `vibesodb2` Python Package               |
+-------------------------------------------------------------------------+
                                     |
+-------------------------------------------------------------------------+
|                      Safety & State Engine                              |
|   - Engine-off validation (PID 010C)     - Mandatory snapshot backup    |
|   - Length-checking & bitwise masking    - Critical module blacklisting |
|   - Atomic rollback execution on NRC     - In-memory bitwise engine     |
+-------------------------------------------------------------------------+
                                     |
+-------------------------------------------------------------------------+
|                      UDS Engine (ISO 14229)                             |
|   - Session Control (0x10)               - TesterPresent loop (0x3E)    |
|   - Read Data By Identifier (0x22)       - Write Data By ID (0x2E)      |
|   - Fault Management (Read 0x19 / Clear 0x14)                           |
+-------------------------------------------------------------------------+
                                     |
+-------------------------------------------------------------------------+
|                    ISO-TP Layer (ISO 15765-2)                           |
|   - Multi-frame reassembly (First Frame 0x10, Consecutive Frames 0x2x)  |
|   - Flow Control generation (0x30 00 00)                                |
+-------------------------------------------------------------------------+
                                     |
+-------------------------------------------------------------------------+
|                Hardware Abstraction Layer (HAL / BLE)                   |
|   - AT/ST command processing (vLinker / STN2120 / ELM327)               |
|   - Nordic UART Service (NUS) GATT transport (MTU 256)                  |
|   - High-fidelity Mock ECU & Dongle Transport for simulation/testing    |
+-------------------------------------------------------------------------+
                                     |
                           [ Vgate vLinker MC+ ]
                                     |
                         [ Physical OBD-II Port ]
```

---

## Supported VAG Platforms & Chassis Matrix

The engine auto-detects the vehicle platform and model directly from the 17-character VIN (positions 7 & 8):

| Platform | Chassis Codes | Primary Models | Years |
| :--- | :--- | :--- | :--- |
| **PQ25** | `7E`, `7F`, `7H`, `7J` | **VW Transporter T5.1 / T6** | 2010–2019 |
| **PQ25** | `6R`, `6C` | **VW Polo Mk5** | 2009–2017 |
| **PQ25** | `6J` | **SEAT Ibiza Mk4** | 2008–2017 |
| **PQ25** | `5J` | **Škoda Fabia Mk2 / Roomster** | 2007–2014 |
| **PQ35** | `1K`, `5K`, `AJ` | **VW Golf Mk5 / Mk6** | 2004–2013 |
| **PQ35** | `2K`, `2C` | **VW Caddy Mk3 / Mk4** | 2004–2020 |
| **PQ35** | `1T` | **VW Touran** | 2003–2015 |
| **PQ35** | `5N` | **VW Tiguan Mk1** | 2007–2016 |
| **PQ35** | `13` | **VW Scirocco Mk3** | 2008–2017 |
| **PQ35** | `8P` | **Audi A3 Mk2** | 2003–2013 |
| **PQ35** | `1P` | **SEAT Leon Mk2** | 2005–2012 |
| **PQ35** | `1Z` | **Škoda Octavia Mk2** | 2004–2013 |
| **PQ46** | `3C`, `36`, `CC` | **VW Passat B6 / B7 / CC** | 2005–2016 |
| **MQB** | `5G`, `BA`, `AU` | **VW Golf Mk7 / 7.5 / Alltrack** | 2012–2020 |
| **MQB** | `7L` | **VW Transporter T6.1** | 2019–2024 |
| **MQB** | `8V` | **Audi A3 Mk3** | 2012–2020 |
| **MQB** | `5F` | **SEAT Leon Mk3** | 2012–2020 |
| **MQB** | `5E` | **Škoda Octavia Mk3** | 2012–2020 |
| **MQB** | `3G` | **VW Passat B8** | 2014–2023 |
| **MQB** | `AD`, `BW` | **VW Tiguan Mk2** | 2016–2023 |

---

## Key Capabilities

* **UDS Long Coding Read/Write:** Natively reads and writes 24- to 30-byte configuration arrays on the Body Control Module (BCM), Instrument Cluster, and Gateway via UDS Services `0x22` and `0x2E`.
* **Vehicle Identity & Live ECU Specs:** Auto-decodes VIN, model year, manufacturing plant, chassis serial number, and queries ECU Hardware Number (`0xF191`), Software Version (`0xF189`), Spare Part Number (`0xF187`), and ECU Serial (`0xF18C`).
* **Real-Time Telemetry Multi-Tier Loop:** Streams live sensor telemetry while driving (Fast 30–50 Hz loop for Speed, RPM, Boost, Throttle vs Slow 1–2 Hz loop for Coolant, IAT, Fuel Rail, and OEM VAG UDS for DPF soot loading, Turbo EGT, and DSG gear).
* **Virtual Cockpit Digital Dashboard:** Automotive instrument cluster HUD with SVG tachometer arc, boost meter, thermal gauges, and telemetry diagnostic stats.
* **Backup Explorer with Differential Comparison:** Automatic pre-write snapshots with visual byte diffing, bit alteration notes, single-snapshot JSON download, and instant one-tap restore.
* **Open Community JSON Schemas:** Vehicle configuration mappings are decoupled from closed-source databases. Bundled with clear definitions for PQ25, PQ35, and MQB, with easy in-app custom setting creation and one-click export for sharing with the community.
* **Interactive Byte Matrix & Bit Inspector:** Low-level 30-byte array inspection with individual bit toggles and real-time hex calculation.
* **Comprehensive Fault Management:** Reads active and confirmed Diagnostic Trouble Codes (DTCs) across modules via UDS Service `0x19`, with one-tap clearing via Service `0x14`.
* **Hardware-Accelerated ISO-TP:** Supports STN/ELM-extended chipsets (`ATCAF1`) to prevent buffer overruns during multi-frame operations, with fallback software reassembly.
* **High-Fidelity ECU Simulation:** Built-in virtual STN adapter and VAG ECU testbench for offline development and testing.

---

## Safety Guardrails & Fail-Safes

Writing to vehicle controllers carries inherent risk. vibesODB2 enforces five automated pre-flight checks:

1. **Critical Module Coding Write Blacklist:** Hardcoded blocks prevent long-coding write operations (`0x2E`) to safety-critical controllers, including ABS/ESP (`0x03`), Airbag Systems (`0x15`), and Electromechanical Steering (`0x44`) to protect critical life-safety systems from corrupt configurations. Fault code reading and DTC clearing (`0x19` / `0x14`) remain fully supported across all modules for routine maintenance and warning light resets.
2. **Engine Running Interlock:** The tool queries standard OBD-II PID `010C` (Engine RPM) before every session transition. If RPM $> 0$, write operations are strictly blocked. The vehicle must be in an **Ignition ON / Engine OFF** state.
3. **Immutable Pre-Write Snapshots:** Captures the existing raw hex configuration immediately before any write payload is dispatched (stored in browser IndexedDB for PWA or SQLite for CLI).
4. **Strict Payload Sizing:** If a target module returns a 30-byte payload upon read, the write engine rejects any modified payload that does not equal 30 bytes. Truncated or over-length writes are blocked client-side.
5. **Atomic Rollback:** If the controller returns a UDS Negative Response Code (`0x7F 0x2E [NRC]`), the session is terminated and the original baseline hex string is automatically restored or offered as a one-tap rollback.

---

## Tested & Supported Adapters

Writing multi-byte coding payloads over CAN requires adapters with hardware flow control and extended internal receive buffers (minimum 2 KB). Generic clone ELM327 devices with small 64-byte UART buffers are **not supported** due to packet-dropping risks.

* **Vgate vLinker MC+ (BLE 4.0 / Android & iOS)** *(Recommended)*
* **OBDLink MX+ (MFi / Bluetooth)**
* **OBDLink CX (BLE 4.0 / iOS & Android)**

### Connection Profile (BLE GATT)
* **Target Service:** Nordic Semiconductor UART Service (`UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E`)
* **TX Characteristic:** `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` (Write without response / Write)
* **RX Characteristic:** `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` (Notify)
* **Negotiated MTU:** 256 bytes

---

## Getting Started

### 1. Progressive Web App (Zero Install)
Open [**https://orviwan.github.io/vibesODB2/**](https://orviwan.github.io/vibesODB2/) in a compatible browser (Chrome on Android/Desktop, or Bluefy on iOS) and tap **Connect BLE**.

### 2. Python CLI & Developer Setup

```bash
# Clone the repository
git clone https://github.com/orviwan/vibesODB2.git
cd vibesODB2

# Create virtual environment and install dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# Run automated test suite
pytest
```

### Unified CLI Commands

```bash
# 1. Scan for nearby BLE OBD-II adapters
vibesodb2 scan

# 2. Dump BCM long coding (auto-detects platform from VIN or specify --platform)
vibesodb2 dump --mock
vibesodb2 dump --mock --platform MQB
vibesodb2 dump --mac "AA:BB:CC:11:22:33"

# 3. Enable a feature with pre-write safety audit and confirmation
vibesodb2 set --mock --feature cornering_fog_lights --enable

# 4. View immutable backup snapshots
vibesodb2 backups

# 5. One-click rollback to a previous backup snapshot
vibesodb2 backups --mock --restore 1

# 6. Read and clear Diagnostic Trouble Codes (DTCs)
vibesodb2 dtc --mock
vibesodb2 dtc --mock --clear

# 7. List, add custom settings, and export schemas to share with the community
vibesodb2 schema list
vibesodb2 schema add --platform MQB --module 0x09 --id custom_horn --byte 2 --bit 5 --name "Alarm Horn Honk" --desc "Beeps horn on lock"
vibesodb2 schema export --platform MQB --module 0x09 --out community_mqb_bcm.json

# 8. Stream Real-Time Telemetry to Terminal Live HUD
vibesodb2 live --mock
vibesodb2 live --mock --drive-mode spirited --rate 40
vibesodb2 live --mac "AA:BB:CC:11:22:33"

# 9. Launch the Progressive Web App locally or open the cloud app
vibesodb2 web --online
vibesodb2 web
```

---

## 🤝 Sharing Discovered Features with the Community

If you discover a new feature or bit setting on your car:
1. Test the setting on your vehicle using the **"Add Custom Setting"** feature in the app or CLI.
2. Verify that the feature works as expected (e.g. cornering lights or mirror dip).
3. Click **"Export Schema"** (or run `vibesodb2 schema export`) to save your custom definition file.
4. Share your exported JSON file on GitHub so other drivers, enthusiasts, and mechanics can benefit!

---

## Legal & Safety Disclaimer

* This project is an independent open-source initiative and is **not** affiliated, endorsed, or associated with Volkswagen AG, Ross-Tech LLC, or any of their subsidiaries.
* All trademarks, platform codes, and registered names belong to their respective owners and are used strictly for reference and vehicle interoperability under fair use and Right to Repair frameworks.
* Modifying vehicle parameters can alter vehicle lighting, warning systems, and convenience operations. The developers assume no responsibility for physical damage, system lockout, MOT/inspection failure, or traffic infractions resulting from the use of this software. Always test modifications in a controlled environment.

---

## License

Distributed under the **MIT License**. See `LICENSE` for details.
