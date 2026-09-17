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
|   - Engine-off validation (PID 010C)     - Mandatory snapshot backup    |
|   - Length-checking & bitwise masking    - Critical module write lock   |
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

## Protocol & Diagnostics Stack

### 1. Unified Diagnostic Services (ISO 14229-1 UDS) & KWP2000
* **Diagnostic Session Control (`0x10`)**: Switches between Default Session (`0x01`) and Extended Diagnostic Session (`0x03`).
* **TesterPresent (`0x3E 0x80`)**: Asynchronous background keepalive loop dispatched every 2000 ms with suppressed positive responses to maintain extended sessions without timing out.
* **Read Data By Identifier (`0x22`)**:
  * `0xF190`: Vehicle Identification Number (VIN)
  * `0xF187`: ECU Spare Part Number
  * `0xF191`: ECU Hardware Number
  * `0xF189`: ECU Software Version Number
  * `0xF18C`: ECU Serial Number
  * `0x0600`: Central Electric (BCM) Long Coding Payload (24–30 Bytes)
* **Write Data By Identifier (`0x2E`)**: Writes modified long-coding payloads with verified session authorization and length checks.
* **Dual-Protocol Diagnostic Auto-Scan**:
  * **Modern UDS (`0x19 0x02 0x09`)**: Queries confirmed and pending DTC records (3-byte DTC + 1-byte status mask).
  * **Older KWP2000 / TP2.0 (`0x18 0x00 0xFF 0x00`)**: Read DTCs by status mask on pre-facelift models (e.g. Transporter T5 7H). Parses 16-bit VAG 5-digit decimal codes (`DTC = (high << 8) | low`, e.g. `0x045D` = `01117`, `0x063E` = `01598`, `0x024C` = `00588`).
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

Before any configuration payload is written over UDS, vibesODB2 passes the operation through a five-stage defensive safety pipeline:

1. **Critical Module Coding Write Blacklist**: Rejects long-coding write operations (`0x2E`) to safety-critical controllers:
   * `0x03`: ABS / ESP Braking & Stability Systems
   * `0x15`: Airbag Deployment & Occupant Restraint Systems
   * `0x44`: Electromechanical Power Steering (EPS)
   *(Note: DTC reading and clearing via `0x19`/`0x14` is permitted across all modules).*
2. **Engine Running Interlock**: Queries standard OBD-II Mode 01 PID `010C` (Engine RPM). If RPM $> 0$, all write operations are strictly aborted. The vehicle must be in an **Ignition ON / Engine OFF** state.
3. **Immutable Pre-Write Snapshot**: Automatically captures an immutable snapshot of the existing raw hex configuration before writing. Snapshots are stored in IndexedDB (browser) or SQLite (CLI).
4. **Strict Payload Length Verification**: Validates that the modified byte array exactly matches the ECU's expected byte length (e.g. 30 bytes). Truncated or padded payloads are rejected client-side.
5. **Atomic Rollback on Negative Response (NRC)**: If the ECU returns `0x7F 0x2E [NRC]`, the session is terminated and the original baseline hex string is immediately re-flashed or queued for one-click restore.

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

Vehicle feature coordinates are decoupled into modular JSON schema files. Example definition for PQ25 / MQB Central Electric (`0x09`):

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
      "prerequisites": "OEM alarm siren installed."
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
# Run pytest test suite (45 unit & integration tests)
pytest -v

# Run JavaScript syntax checks
node --check pwa/js/app.js && node --check pwa/sw.js
```

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

# 3. Enable a feature with pre-write safety audit and confirmation
vibesodb2 set --mock --feature cornering_fog_lights --enable

# 4. View immutable backup snapshots
vibesodb2 backups

# 5. One-click rollback to a previous backup snapshot
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
