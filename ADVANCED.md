# vibesODB2 — Advanced Technical Documentation & Developer Guide

This document contains in-depth architectural details, protocol specifications, developer setup instructions, and the unified Python CLI guide for **vibesODB2**.

For the simple, user-facing overview and web app, see [**README.md**](README.md).

---

## 📑 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Protocol & Diagnostics Stack](#protocol--diagnostics-stack)
3. [Safety Guardrails Pipeline](#safety-guardrails-pipeline)
4. [Real-Time Telemetry Multi-Rate Scheduler](#real-time-telemetry-multi-rate-scheduler)
5. [Community Schema Specification](#community-schema-specification)
6. [Hardware & BLE GATT Specifications](#hardware--ble-gatt-specifications)
7. [Developer Installation & Test Suite](#developer-installation--test-suite)
8. [Unified CLI Reference](#unified-cli-reference)

---

## Architecture Overview

vibesODB2 uses a modular, decoupled architecture separating hardware communication, protocol abstraction, safety guardrails, and vehicle configuration definitions:

```
+-------------------------------------------------------------------------+
|                        Application Layer (PWA & CLI)                    |
|       - Progressive Web App (PWA): https://orviwan.github.io/vibesODB2/ |
|       - Unified Developer CLI: `vibesodb2` Python Package               |
+-------------------------------------------------------------------------+
                                     |
+-------------------------------------------------------------------------+
|                      Safety & State Engine                              |
|   - Live baseline required               - Mandatory snapshot backup    |
|   - Engine-off validation (PID 010C)     - Critical module write lock   |
|   - Length check                         - Read-back verification       |
|   - Module re-targeting after broadcast  - Bus lock for pollers         |
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

## Protocol & Diagnostics Stack

### 1. Unified Diagnostic Services (ISO 14229-1 UDS) & KWP2000
* **Diagnostic Session Control (`0x10`)**: Switches between Default Session (`0x01`) and Extended Diagnostic Session (`0x03`).
* **TesterPresent**: background keepalive while a diagnostic operation holds the bus. The CLI sends `0x3E 0x80` (suppressed positive response) every 2000 ms; the PWA sends `0x3E 0x00` every 2500 ms and stops it when the operation releases the bus lock.
* **Read Data By Identifier (`0x22`)**:
  * `0xF190`: Vehicle Identification Number (VIN)
  * `0xF187`: ECU Spare Part Number
  * `0xF191`: ECU Hardware Number
  * `0xF189`: ECU Software Version Number
  * `0xF18C`: ECU Serial Number
  * `0x0600`: Central Electric (BCM) Long Coding Payload (24–30 Bytes)
* **Write Data By Identifier (`0x2E`)**: Writes a modified long-coding payload. Success means a `0x6E <DID>` positive response **and** a matching read-back of the identifier; anything else is reported as a failed write.
* **SecurityAccess (`0x27`)**: not performed. No verified seed/key algorithm is bundled, and sending a login PIN as raw key bytes is wrong and can lock the ECU. The client refuses unless a real key-derivation function is supplied.
* **Response pending (`0x7F <SID> 0x78`)**: the final message that follows it is used; a lone `0x78` is surfaced as a retryable negative response rather than a hard failure.
* **Diagnostic Auto-Scan** over the modules whose CAN IDs are marked `verified` in `MODULE_ARBITRATION` (`pwa/js/uds.js`):
  * **UDS (`0x19 0x02 0x09`)**: Queries confirmed and pending DTC records (3-byte DTC + 1-byte status mask).
  * **KWP2000-style fallback (`0x18 0x00 0xFF 0x00`)**: attempted over ISO-TP only when `0x19` is rejected. This is experimental: VAG's KWP2000 generation uses the TP2.0 transport, which is **not implemented**, so pre-2008 vehicles are not supported. Parses 16-bit VAG 5-digit decimal codes (`DTC = (high << 8) | low`, e.g. `0x045D` = `01117`).
  * **Failure Type Byte (FTB) Decoding**: Decodes VAG symptom codes (`008` Implausible Signal, `002` Lower Limit Exceeded, `33-00` Resistance Too Low).
  * **Curated Knowledge Base (`dtc_db.js`)**: Maps fault codes to plain-English meanings, real-world physical failure causes (e.g. broken alternator loom wire near starter bracket, worn clockspring), and actionable repair steps.
* **Clear Diagnostic Information (`0x14 FF FF FF` / `0x14 FF 00`)**: Resets DTCs across modules or targets specific ECUs.

### 2. ISO-TP Network Layer (ISO 15765-2)
* **Single Frame (SF)**: Transmitted for payloads $\le 7$ bytes (PCI `0x0N`).
* **First Frame (FF)**: Issued for multi-byte payloads (PCI `0x1N NN`).
* **Flow Control (FC)**: Engine generates `0x30 00 00` (Clear to send, block size 0, separation time 0 ms).
* **Consecutive Frame (CF)**: Sequence counter tracked (`0x21` through `0x2F`, wrapping to `0x20`).
* **Hardware Acceleration**: Automatic negotiation of STN/ELM chipset auto-flow control (`ATCAF1`) with software fallback reassembler.

---

## Safety Guardrails Pipeline

Every long-coding write goes through one function: `executeCodingWrite` in `pwa/js/writeflow.js` (PWA) or `SafetyEngine.execute_safe_write` in `vibesodb2/safety/guardrails.py` (CLI). Feature code never calls the write service directly. The pipeline is:

1. **Live baseline required** (PWA): the coding must have been read from this vehicle in this session. The bundled demo coding can never be written.
2. **Critical module blacklist**: long-coding writes (`0x2E`) to `0x03` ABS/ESP, `0x15` airbag and `0x44` steering are rejected. Module addresses are normalised first, so `03`, `0X03` and `0x03` are all caught. *(DTC reading and clearing via `0x19`/`0x14` is permitted on all modules.)*
3. **Ignition and engine interlock**: the RX filter is cleared and `01 0C` is requested on the functional `7DF` header. No reply, an unparseable reply, or RPM above zero blocks the write.
4. **Strict payload length**: the modified payload must be exactly as long as the baseline.
5. **Pre-write snapshot**: the baseline is stored in IndexedDB (browser) or SQLite (CLI) before anything is sent.
6. **Re-target and write**: the adapter is re-addressed to the target module (`ATSH`/`ATCRA`/flow control) because the interlock left it on `7DF`; the extended session is opened; `0x2E` is sent and must be acknowledged with `0x6E <DID>`.
7. **Read-back verification**: the identifier is read back and compared byte for byte. On mismatch the baseline is written back once and the result, including whether the restore was acknowledged, is reported.

A negative response to the write is reported as a failure and **nothing is re-written**: an NRC means the ECU did not change anything.

**Bus ownership (PWA).** Telemetry polling, the ignition poll and TesterPresent share the adapter's command queue with diagnostic operations. Every diagnostic operation runs under `app.withBusLock()`, which pauses telemetry, makes the ignition poll skip, and stops TesterPresent when the operation ends, so header and filter state cannot be changed underneath a read or write.

**Verified CAN IDs.** `MODULE_ARBITRATION` carries a `verified` flag per module. Unverified modules are excluded from the default scan and `setTargetModule` refuses them unless explicit request/response IDs are supplied. The Python `MODULE_REGISTRY` must match the verified JS entries; `tests/test_module_table.py` enforces it.

**Removed features.** Service-interval reset, battery registration, parking-brake service mode, one-click adaptations and the manufacturer-specific mileage read were removed because their identifiers were unverified and they bypassed this pipeline. See `docs/REMOVED_FEATURES.md`.

---

## Real-Time Telemetry Multi-Rate Scheduler

Because Bluetooth OBD-II operates on sequential request-response polling, vibesODB2 uses an asynchronous multi-rate scheduler to achieve high refresh rates:

| Frequency Tier | Target Rate | Monitored Parameters | Protocol & Service |
| :--- | :--- | :--- | :--- |
| **FAST LOOP** | **20–50 Hz** (20–50 ms) | Vehicle Speed, Engine RPM, Manifold Absolute Pressure (MAP / Boost), Throttle Position | Standard OBD-II (Mode 01) |
| **SLOW LOOP** | **1–2 Hz** (1000–2000 ms) | Coolant Temp, Intake Air Temp (IAT), Common Rail Fuel Pressure, Engine Runtime | Standard OBD-II (Mode 01) |
| **OEM VAG UDS** | **2–5 Hz** (200–500 ms) | DPF Soot Mass Measured (`DID 0x1154`), Turbo EGT (`DID 0x1155`), DSG Engaged Gear (`DID 0x1156`) | VAG UDS (Service 0x22) |

---

## Community Schema Specification

Vehicle feature coordinates are decoupled into modular JSON schema files. Every feature carries a `verified_on` list of vehicles on which the coordinate was confirmed; an empty list is shown as **Unverified** in the UI. Descriptive text must be original (see `CONTRIBUTING.md`). Features in the `Daytime Running Lights` and `Exterior Lighting` categories automatically carry a road-legal warning. Example definition for PQ25 / MQB Central Electric (`0x09`):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "platform": "PQ25_T51",
  "chassis_codes": ["7E", "7F", "7H", "7J", "6R", "6C", "6J", "5J"],
  "module_address": "0x09",
  "tx_header": "70E",
  "rx_filter": "778",
  "coding_did": "0x0600",
  "expected_byte_length": 30,
  "features": [
    {
      "id": "acoustic_lock_chirp",
      "category": "Locking Feedback",
      "byte": 1,
      "bit": 2,
      "name": "Acoustic Lock Confirmation",
      "description": "Sounds brief alarm siren chirp when vehicle is locked.",
      "prerequisites": "OEM alarm siren installed.",
      "verified_on": []
    }
  ]
}
```

---

## Hardware & BLE GATT Specifications

* **Recommended Adapter**: Vgate vLinker MC+ (Bluetooth 4.0 BLE / STN2120 chipset)
* **DIY Hardware Option**: ESP32 DevKit + SN65HVD230 3.3V CAN Transceiver (see full schematic, BOM, and firmware in [**DIY_ESP32_OBD2_ADAPTER.md**](DIY_ESP32_OBD2_ADAPTER.md))
* **Target Service**: Nordic Semiconductor UART Service (`UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E`)
* **TX Characteristic**: `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` (Write without response / Write)
* **RX Characteristic**: `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` (Notify)
* **Negotiated MTU**: 256 bytes

---

## Developer Installation & Test Suite

### 1. Local Setup
```bash
# Clone the repository
git clone https://github.com/orviwan/vibesODB2.git
cd vibesODB2

# Create virtual environment and install in editable mode
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 2. Running Automated Tests
```bash
# Everything: syntax, JS unit tests, pytest, headless-Chrome end-to-end (needs Google Chrome)
npm test

# Individually
node --test --test-force-exit tests/js/    # PWA protocol/safety unit tests (node:test)
pytest -v                                   # CLI, simulator, guardrails, JS/Python table parity
python scripts/test_pwa_sim.py              # End-to-end against the in-browser simulator
```

The project is test-first: write the failing test, watch it fail, then implement. See `CONTRIBUTING.md` and `AGENTS.md`.

---

## Unified CLI Reference

The `vibesodb2` CLI provides full diagnostic and coding workflows:

```bash
# 1. Scan for nearby BLE OBD-II adapters
vibesodb2 scan

# 2. Dump BCM long coding (auto-detects platform from VIN or specify --platform)
vibesodb2 dump --mock
vibesodb2 dump --mock --platform MQB
vibesodb2 dump --mac "AA:BB:CC:11:22:33"

# 3. Enable a feature with pre-write safety audit, confirmation and read-back verification
vibesodb2 set --mock --feature cornering_fog_lights --enable

# 4. View backup snapshots
vibesodb2 backups

# 5. Restore a previous backup snapshot (goes through the same audited write path)
vibesodb2 backups --mock --restore 1

# 6. Read and clear Diagnostic Trouble Codes (DTCs)
vibesodb2 dtc --mock
vibesodb2 dtc --mock --clear
vibesodb2 dtc --mac "AA:BB:CC:11:22:33" --module 0x15 --clear

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
