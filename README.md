# vibesODB2

### Free, open-source diagnostics and long-coding for Volkswagen Group vehicles, in your browser

> [!WARNING]
> **ALPHA SOFTWARE. Verified on very few vehicles.**
> vibesODB2 can read and write configuration ("long coding") in vehicle control units. A wrong write can disable features or leave a module misconfigured. Every coding option is labelled **Verified** or **Unverified**; most are still unverified. Read the [safety section](#safety-what-the-tool-does-and-does-not-do) and export your backups before writing anything. Use at your own risk.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Live App](https://img.shields.io/badge/Live%20App-Launch%20vibesODB2-success?logo=github)](https://orviwan.github.io/vibesODB2/)
[![Technical Docs](https://img.shields.io/badge/Docs-Advanced%20Guide-blue.svg)](ADVANCED.md)

**vibesODB2** is a progressive web app for Volkswagen, Audi, SEAT and Škoda vehicles whose control units speak UDS (ISO 14229) over CAN. It runs in Chrome or Edge on a phone or laptop and talks to an inexpensive Bluetooth Low Energy OBD-II adapter with an ELM327-compatible command set.

* No subscription, no credits, no account.
* No proprietary dongle. Standard BLE adapters work; a [DIY ESP32 adapter](DIY_ESP32_OBD2_ADAPTER.md) is documented.
* Nothing leaves your device. There is no backend, no analytics, and no remote schema fetching in the app.

👉 **Open the app:** [https://orviwan.github.io/vibesODB2/](https://orviwan.github.io/vibesODB2/)

| Live Dashboard | Multi-Module Auto-Scan | Feature Coding | Service | Backups | Byte Matrix |
| :---: | :---: | :---: | :---: | :---: | :---: |
| <a href="docs/images/pwa_mobile_cockpit.png"><img src="docs/images/pwa_mobile_cockpit.png" width="180" alt="Live Dashboard" /></a> | <a href="docs/images/pwa_mobile_dtcs.png"><img src="docs/images/pwa_mobile_dtcs.png" width="180" alt="Multi-Module Auto-Scan" /></a> | <a href="docs/images/pwa_mobile_coding.png"><img src="docs/images/pwa_mobile_coding.png" width="180" alt="Feature Coding" /></a> | <a href="docs/images/pwa_mobile_service.png"><img src="docs/images/pwa_mobile_service.png" width="180" alt="Service" /></a> | <a href="docs/images/pwa_mobile_backups.png"><img src="docs/images/pwa_mobile_backups.png" width="180" alt="Backups" /></a> | <a href="docs/images/pwa_mobile_matrix.png"><img src="docs/images/pwa_mobile_matrix.png" width="180" alt="Byte Matrix" /></a> |

---

## What it does

### 1. Live dashboard and telemetry scope
Standard OBD-II (SAE J1979 Mode 01) polling with a fast loop for speed and RPM and slower loops for temperatures, boost, load, fuel rate and battery voltage. Live graphing and CSV export of a driving session. Optional screen wake lock. Diesel particulate filter values are requested from manufacturer-specific identifiers when the standard PID is not answered.

### 2. Feature coding (long coding)
Reads the current coding from the selected module, decodes it against a bundled schema of byte/bit switches, and lets you toggle a feature. Every write goes through the audited path described below and is verified by reading the coding back. Features are grouped by category with Active / Disabled filters, and each one shows whether it has been **verified on a real vehicle**. Exterior lighting options carry a road-legal warning.

### 3. Multi-module fault-code scan
Scans the modules whose CAN addresses this project has verified (engine, gearbox, ABS, climate, central electrics, airbag, cluster, gateway, steering), reads part numbers and fault codes using UDS service `0x19`, decodes VAG five-digit codes and SAE P-codes, and shows a plain-English "what it means and what to check" drawer for known codes. Fault memory can be cleared per module or across all scanned modules. A KWP2000-style fallback (`0x18`) is attempted only over ISO-TP; it is experimental and does not implement TP2.0.

### 4. Service
Reads the standard OBD-II odometer PID (`01 A6`) where the engine ECU supports it. Service-interval resets, battery registration, parking-brake service mode and one-click adaptations were **removed** from this release because their identifiers had not been verified on any vehicle. See [docs/REMOVED_FEATURES.md](docs/REMOVED_FEATURES.md) for what it takes to bring one back.

### 5. Backups
A snapshot of the current coding is stored in the browser before every write and on first read. Snapshots are grouped by VIN, can be tagged with a registration for fleet or family use, exported and imported as JSON, and restored only to the same VIN and module they came from. Browser storage is not permanent: export your snapshots.

### 6. Vehicle simulator
A built-in virtual vehicle lets you try every screen with no hardware. Add `?sim=1` to the URL or use the Simulator button. The simulator behaves like a real bus: requests on unknown or broadcast headers are not answered by a module.

---

## Safety: what the tool does and does not do

Before any coding write the app runs these checks and refuses the write if any fails, telling you why:

1. **Live baseline required.** The current coding must have been read from this vehicle in this session. The bundled demo coding can never be written.
2. **Module blacklist.** ABS/ESP (`0x03`), airbag (`0x15`) and power steering (`0x44`) are never write targets.
3. **Ignition on, engine off.** Engine speed is requested over the standard OBD broadcast; a non-zero or unreadable reply blocks the write.
4. **Length check.** The new payload must be exactly as long as the one read from the module.
5. **Snapshot.** The current coding is saved locally first.
6. **Positive response and read-back.** After the adapter is re-addressed to the target module, the write must be acknowledged with `6E <DID>`, then the identifier is read back and compared. If the read-back differs, the saved baseline is written back once and the result is reported. A rejected write (negative response) changes nothing on the vehicle and is reported as failed.

What it does **not** do:

* It does not guarantee recovery. If a module stops responding after a write, the automatic restore may also fail. Keep exported backups and know how you would restore them with another tool.
* It does not verify that a coding bit does what its description says unless the feature is marked **Verified** with a vehicle listed.
* It does not perform SecurityAccess. Modules that require a seed/key login cannot be written.
* It is not a substitute for a workshop diagnostic system.

---

## Supported vehicles

The app talks UDS over ISO 15765-2 on the 500 kbit/s diagnostic CAN bus with 11-bit identifiers. In practice that means Volkswagen Group vehicles from roughly **2009 onward** on the PQ25, PQ35/PQ46 and MQB platforms. Vehicles whose modules use KWP2000 over TP2.0 (most models before about 2008, for example a pre-facelift Transporter T5 or a Golf Mk5) are **not supported for coding**.

Schemas are bundled for the central electrics module (`0x09`) and instrument cluster (`0x17`) on PQ25, PQ35 and MQB, plus a few smaller modules. A schema being bundled does not mean it has been tested on your car: check the **Verified** badge on each feature.

**Community-verified vehicles:** none recorded yet. If you confirm a feature on your car, open an issue titled `verify: <feature>` (see [CONTRIBUTING.md](CONTRIBUTING.md)).

---

## Hardware

Any BLE OBD-II adapter that exposes a serial GATT service and understands the ELM327 command set should work. Adapters using the STN family of chips (for example the Vgate vLinker MC+ or OBDLink MX+/CX) handle multi-frame messages reliably. Very cheap clones with small buffers drop frames during long reads and are not recommended for coding.

A DIY ESP32 adapter with a 3.3 V CAN transceiver is documented in [DIY_ESP32_OBD2_ADAPTER.md](DIY_ESP32_OBD2_ADAPTER.md), including the hazards to avoid.

---

## Getting started

1. Plug the adapter into the diagnostic socket.
2. Turn the ignition on with the engine off.
3. Open [https://orviwan.github.io/vibesODB2/](https://orviwan.github.io/vibesODB2/) in Chrome or Edge (Android, Windows, macOS, ChromeOS; Linux needs the experimental Web Bluetooth flag) and tap **Connect BLE**. On iPhone and iPad use a Web Bluetooth capable browser app such as Bluefy, because Safari does not expose Web Bluetooth.
4. Read the acknowledgement shown before the first connection.
5. On the Feature Coding tab, tap **Read Live Coding** before changing anything.

---

## Contributing

Bug reports, verified coordinates and fault-code write-ups are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first: it explains the test-first workflow, the rule that all descriptive text must be original, and how to report a verified feature. Automated coding agents should follow [AGENTS.md](AGENTS.md).

Developers: protocol details, the CLI, the test suite and the architecture are in [ADVANCED.md](ADVANCED.md).

---

## Legal, safety and trademarks

**Independence.** vibesODB2 is an independent open-source project. It is not affiliated with, endorsed by, or associated with Volkswagen AG, AUDI AG, SEAT S.A., Škoda Auto, Elm Electronics, Ross-Tech, or any other vehicle manufacturer or diagnostic tool vendor.

**Trademarks.** Vehicle make and model names, "ELM327", and other product names are the property of their owners and are used here only to describe compatibility. They are not used as names for any part of this project.

**Your responsibility.** Changing a vehicle's configuration can alter how lights, locking, wipers and warning systems behave. Some options (for example exterior lighting behaviour) are regulated by UNECE Regulation 48 and national law such as the UK Road Vehicles Lighting Regulations, and a non-compliant vehicle may fail inspection or affect insurance. Clearing fault memory removes information a technician may need and resets emissions readiness. Modifying configuration may affect a manufacturer's warranty. You are responsible for checking the rules that apply to you and for any change you make. Only use this tool on vehicles you own or have permission to work on.

**No warranty.** This software is provided "as is", without warranty of any kind, under the [MIT License](LICENSE). The authors and contributors accept no liability for damage, loss, or costs arising from its use.

**Data.** The app stores snapshots, custom settings and preferences in your browser only. Nothing is sent anywhere.
