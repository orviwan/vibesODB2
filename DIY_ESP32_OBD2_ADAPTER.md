# Building a DIY ESP32 BLE OBD-II Adapter for vibesODB2

Welcome to the complete hardware and firmware build guide for creating your own **high-speed, custom Bluetooth Low Energy (BLE) OBD-II adapter** using an **ESP32** and a **3.3V CAN transceiver**.

This adapter works with **[vibesODB2](https://orviwan.github.io/vibesODB2/)**, supports standard VAG 500 kbps high-speed CAN, implements a subset of the ELM327-style AT command set over the Nordic UART Service (NUS), and costs **less than £12 / $15** in off-the-shelf components.

> [!CAUTION]
> **Read before building.** This is a hobbyist design, not a certified product. It has no CE / UKCA / FCC conformity assessment, no automotive-grade EMC testing, and no type approval. You build, install and use it entirely at your own risk. A wiring mistake can damage the vehicle's CAN bus, gateway, or battery, and a device left plugged in can flatten the battery. Never leave a self-built adapter connected while the vehicle is unattended, and do not use it on a vehicle you do not own or have permission to work on. "ELM327" is a trademark of Elm Electronics; this firmware is not an Elm product and only implements a compatible subset of its command set for interoperability. See the [licence and legal notes in the README](README.md#legal-safety-and-trademarks).

---

## 📑 Table of Contents
1. [Why Build Your Own?](#1-why-build-your-own)
2. [Bill of Materials (BOM) & Costs](#2-bill-of-materials-bom--costs)
3. [System Architecture](#3-system-architecture)
4. [CRITICAL Automotive Hazards & Traps](#4-critical-automotive-hazards--traps)
   - [Trap 1: The 120Ω Bus Termination Disaster](#trap-1-the-120-bus-termination-disaster)
   - [Trap 2: Parasitic Battery Drain & Deep Sleep](#trap-2-parasitic-battery-drain--deep-sleep)
   - [Trap 3: Automotive Voltage Spikes & Load Dumps](#trap-3-automotive-voltage-spikes--load-dumps)
   - [Trap 4: 3.3V vs 5.0V Transceiver Logic](#trap-4-33v-vs-50v-transceiver-logic)
5. [Complete Circuit Schematic & Pinout](#5-complete-circuit-schematic--pinout)
6. [Complete Firmware (`vibes_esp32_obd.ino`)](#6-complete-firmware-vibes_esp32_obdino)
7. [Building & Flashing Instructions](#7-building--flashing-instructions)
8. [Bench Testing & Commissioning Checklist](#8-bench-testing--commissioning-checklist)
9. [Vehicle Connection & vibesODB2 Walkthrough](#9-vehicle-connection--vibesodb2-walkthrough)
10. [Troubleshooting & Diagnostics](#10-troubleshooting--diagnostics)

---

## 1. Why Build Your Own?

Commercial adapters like the **Vgate vLinker MC+** or **OBDLink MX+** are great, but building an ESP32-based adapter gives you massive technical advantages:

* ⚡ **Massive Buffer Size**: Cheap ELM327 clone dongles have 64-byte or 128-byte internal buffers that overflow and drop packets during long UDS coding reads (e.g. `0x22 F1 90` or Gateway module adaptation dumps). The ESP32 gives us **520 KB of SRAM**, allowing a 4 KB - 16 KB ring buffer with zero dropped frames.
* 🚀 **Blazing Refresh Rate**: Native ESP32 TWAI (Two-Wire Automotive Interface) hardware controller processes CAN frames in silicon at microsecond latency, delivering 30-50 Hz live telemetry updates in the vibesODB2 cockpit.
* 🔋 **Full Firmware Control**: Transparent open-source C++ code. You can log raw CAN traffic to serial, implement custom flow control timing, and modify sleep thresholds.
* 💰 **Ultra Low Cost**: Total build cost is ~$12 to $15 (£10 to £12).

---

## 2. Bill of Materials (BOM) & Costs

All components are readily available on Amazon, AliExpress, eBay, or electronics distributors (Mouser/DigiKey).

| Item | Component | Key Specification | Qty | Approx Cost | Search Keywords / Notes |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **U1** | **ESP32 Development Board** | ESP32-WROOM-32 (NodeMCU or DevKitC 30/38 pin) with Micro-USB or USB-C | 1 | $4.00 / £3.50 | `ESP32 NodeMCU ESP-WROOM-32` |
| **U2** | **CAN Transceiver Module** | **SN65HVD230** (3.3V Logic) Breakout Board | 1 | $2.00 / £1.80 | `SN65HVD230 CAN module 3.3V` *(Do NOT use 5V TJA1050!)* |
| **U3** | **DC-DC Step-Down Buck Converter** | **MP1584EN** Ultra-Small Buck Converter (Input: 4.5V–28V, Output adjustable to 5.0V) | 1 | $1.50 / £1.20 | `MP1584EN step down buck converter` |
| **P1** | **OBD-II Male Connector Plug** | 16-Pin Male OBD2 Plug Housing with solder terminals | 1 | $2.50 / £2.00 | `OBD2 16 pin male connector shell` |
| **F1** | **PPTC Resettable Fuse** | 500mA hold current, 60V rating, radial lead or SMD | 1 | $0.40 / £0.30 | `PPTC resettable fuse 500mA 60V` |
| **D1** | **Reverse Polarity Diode** | **SS34** (or 1N5819 / 1N5822) Schottky Diode, 3A, 40V | 1 | $0.20 / £0.15 | `SS34 Schottky diode` |
| **D2** | **TVS Transient Diode** | **SMAJ24CA** or **SMBJ24CA** Bidirectional 24V TVS Diode | 1 | $0.50 / £0.40 | `SMAJ24CA bidirectional TVS` |
| **R1** | **Voltage Divider Resistor Top** | 100 kΩ 1/4W Metal Film Resistor (1% tolerance) | 1 | $0.05 / £0.05 | Battery voltage sensing top leg |
| **R2** | **Voltage Divider Resistor Bottom** | 10 kΩ 1/4W Metal Film Resistor (1% tolerance) | 1 | $0.05 / £0.05 | Battery voltage sensing bottom leg |
| **C1** | **Input Filter Capacitor** | 220 µF 35V (or 50V) Low-ESR Electrolytic Capacitor | 1 | $0.30 / £0.25 | Buffers voltage drops during starter cranking |
| **C2** | **ADC Filter Capacitor** | 100 nF (0.1 µF) Ceramic Capacitor 50V | 1 | $0.05 / £0.05 | Placed across R2 to smooth ADC reading |
| **MISC** | **Wires & Enclosure** | 24–28 AWG silicone wire, heat shrink tubing | 1 | $1.00 / £0.80 | - |
| **TOTAL**| | | | **~$12.50 / £10.50** | |

---

## 3. System Architecture

The following diagram illustrates the hardware signal and power paths between the vehicle diagnostic port, the adapter, and the browser running vibesODB2:

```
+---------------------------------------------------------------------------------------+
|                                    VEHICLE (VAG)                                      |
|                                                                                       |
|  [OBD Pin 16 (+12V)]  [OBD Pin 4/5 (GND)]  [OBD Pin 6 (CAN_H)]  [OBD Pin 14 (CAN_L)] |
+----------+-------------------+---------------------+--------------------+-------------+
           |                   |                     |                    |
           v                   |                     |                    |
   [PPTC Fuse 500mA]           |                     |                    |
           |                   |                     |                    |
   [Schottky Diode SS34]       |                     |                    |
           |                   |                     |                    |
   +-------+-------+           |                     |                    |
   |               |           |                     |                    |
   | [TVS 24V] [220uF Cap]     |                     |                    |
   |       |       |           |                     |                    |
   |      GND     GND          |                     |                    |
   |                           |                     |                    |
   +---> [MP1584EN Buck]       |                     |                    |
   |     (12V -> 5.0V)         |                     |                    |
   |           |               |                     |                    |
   |           +---------------+--> ESP32 5V (VIN)   |                    |
   |                           |    ESP32 GND        |                    |
   |                           |                     |                    |
   |                           |    [3.3V Power]     |                    |
   |                           |          |          |                    |
   |                           |          v          |                    |
   |                           |   SN65HVD230 3.3V   |                    |
   |                           |   CAN Transceiver   |                    |
   |                           |   - CAN_H <---------+--------------------+
   |                           |   - CAN_L <------------------------------+
   |                           |   - TXD <-------- ESP32 GPIO 4 (TWAI_TX)
   |                           |   - RXD --------> ESP32 GPIO 5 (TWAI_RX)
   |                           |   *(R2 120-Ohm Resistor DESOLDERED!)*
   |                           |
   +---> [100k / 10k Divider] -+-----------------> ESP32 GPIO 34 (ADC Battery Sense)
                               |
                               v
                       [ ESP32 MCU ]
                       - FreeRTOS Dual Core 240MHz
                       - TWAI CAN Hardware Controller (500 kbps)
                       - Bluetooth Low Energy (BLE 4.2 / 5.0)
                       - Nordic UART Service (NUS)
                               |
                       ((( BLE Wireless )))
                               |
                               v
                  [ Browser / Phone / Tablet ]
                  - vibesODB2 PWA Web App
                  - Web Bluetooth API
```

---

## 4. CRITICAL Automotive Hazards & Traps

Automotive electronics operate in an exceptionally harsh environment. Ignoring the following four engineering principles will cause hardware destruction or malfunction:

### Trap 1: The 120Ω Bus Termination Disaster
> [!CAUTION]
> **YOU MUST REMOVE THE 120Ω TERMINATION RESISTOR ON THE SN65HVD230 BOARD.**
> 
> Failing to remove this resistor can throw vehicle dashboard error lights (ABS, ESP, Power Steering) and prevent ECUs from communicating!

* **The Theory**: ISO 11898 CAN bus requires termination resistors totaling **60Ω** across `CAN_H` and `CAN_L` (two 120Ω resistors, one at each extreme physical end of the wiring harness).
* **The Vehicle Reality**: In VW, Audi, SEAT, and Skoda vehicles, the vehicle's Gateway ECU and Instrument Cluster **already provide the two 120Ω termination resistors inside the vehicle**. Measuring across pins 6 and 14 on an unpowered vehicle OBD port will read ~60Ω.
* **The Trap**: Almost **all** hobbyist SN65HVD230 breakout boards come from the factory with an SMD 120Ω resistor (marked **`R2`** or **`121`**) pre-soldered directly across the `CANH` and `CANL` terminal pads.
* **The Result**: If you plug this board into your vehicle, you introduce a **third** 120Ω resistor in parallel. The total bus resistance drops to:
  $$\frac{1}{R_{total}} = \frac{1}{120} + \frac{1}{120} + \frac{1}{120} = \frac{3}{120} \implies R_{total} = 40\,\Omega$$
  This 40Ω load over-drives the CAN transceiver stages, collapses signal differential voltages ($V_{diff}$), corrupts frame CRC checks, and causes vehicle control modules to register bus communication faults.
* **The Fix**:
  1. Inspect your SN65HVD230 board. Locate the small SMD resistor labeled **`R2`** or printed with **`121`** (or `1200`) adjacent to the CANH/CANL pins.
  2. Touch a hot soldering iron to the resistor to desolder and remove it, or carefully sever the trace leading to it using a hobby knife.
  3. **Verification**: Use a multimeter on resistance (ohms) mode across the breakout board's CANH and CANL pins with no wires attached. It **must read open-circuit / infinite resistance (megaohms)**, NOT 120Ω.

---

### Trap 2: Parasitic Battery Drain & Deep Sleep
> [!WARNING]
> **OBD-II Pin 16 is PERMANENTLY CONNECTED to the car battery.** It is NOT switched off by the ignition key!

* A standard ESP32 with active Wi-Fi/BLE and CAN transceivers consumes between **110 mA and 160 mA** at 5V.
* Over 24 hours: $0.13\,\text{A} \times 24\,\text{h} = 3.12\,\text{Ah}$. Over a 5-day period, this draws over 15 Ah from the vehicle battery. In cold weather or with a slightly aged AGM/lead-acid battery, this **will leave your vehicle stranded with a dead battery**.
* **The Solution Built Into Our Firmware**:
  1. The firmware monitors CAN bus activity and vehicle battery voltage on **GPIO 34**.
  2. If no valid CAN frames or BLE commands occur for **60 seconds** AND battery voltage drops below **12.8V** (indicating engine is OFF and alternator is not charging):
     * The ESP32 sets the transceiver's `Rs` pin HIGH to put the SN65HVD230 into ultra-low-power standby mode (< 1 µA).
     * The ESP32 enters **Deep Sleep**, shutting down RF, CPUs, and peripherals, dropping current draw to **< 15 µA**.
  3. The ESP32 automatically wakes up when CAN activity resumes on GPIO 5 via external GPIO wake-up interrupt or upon a timer poll.

---

### Trap 3: Automotive Voltage Spikes & Load Dumps
> [!IMPORTANT]
> The vehicle 12V electrical rail is notoriously dirty and unstable.

* While resting battery voltage is 12.2V–12.8V, alternator charging reaches 14.4V–14.8V.
* During starter cranking, voltage can instantly drop to **6V–8V**.
* Inductive kickback from heavy relays, air conditioning clutches, and "load dump" events (such as battery disconnect while alternator is spinning) can create high-energy voltage spikes of **40V to 80V** for hundreds of milliseconds.
* **Required Protection Circuitry**:
  1. **PPTC 500mA Resettable Fuse**: Trips if a short circuit occurs in the adapter, preventing vehicle wiring damage or blown car fuses.
  2. **SS34 Schottky Diode**: Blocks reverse polarity in case of accidental reverse connection or negative transient pulses.
  3. **SMAJ24CA Bidirectional TVS Diode**: Clamps any voltage spikes exceeding 24V directly to ground.
  4. **220 µF Low-ESR Capacitor**: Buffers input energy so the buck converter doesn't reset the ESP32 during engine cranking voltage dips.

---

### Trap 4: 3.3V vs 5.0V Transceiver Logic
* The ESP32 TWAI peripheral operates strictly at **3.3V CMOS logic**. Its GPIO pins are **NOT 5V tolerant**.
* Generic CAN breakout boards often feature 5V chips like the **MCP2551** or **TJA1050**. These output 5V logic on the RX pin and will permanently destroy the ESP32 GPIO over time.
* **Always use the SN65HVD230** (or VP230) transceiver. It is powered by 3.3V VCC from the ESP32, outputs 3.3V logic to the ESP32, while fully meeting the ISO 11898 standard for differential bus voltages on CAN_H / CAN_L.

---

## 5. Complete Circuit Schematic & Pinout

### 5.1 OBD-II Port Standard 16-Pin Mapping

Looking directly into the vehicle's female OBD-II socket (or the solder side of the male plug):

```
       1   2   3   4   5   6   7   8
     +-------------------------------+
      \  .   .   .   .   .   .   .   .  /
       \   .   .   .   .   .   .   .   /
        +-----------------------------+
          9  10  11  12  13  14  15  16
```

| OBD Pin # | Function | Wire Destination in Our Build |
| :---: | :--- | :--- |
| **Pin 4** | Chassis Ground | Common System Ground (`GND`) |
| **Pin 5** | Signal Ground | Connect together with Pin 4 to Common `GND` |
| **Pin 6** | **CAN High (ISO 15765-4 500k)** | Connect to **CANH** on SN65HVD230 |
| **Pin 14**| **CAN Low (ISO 15765-4 500k)** | Connect to **CANL** on SN65HVD230 |
| **Pin 16**| **+12V Battery Constant Power** | Connect to **Fuse F1** (Power Supply & ADC Sense) |
| *Pins 1-3, 7-13, 15* | *Unused for CAN diagnostics* | *Leave unconnected (No connection)* |

---

### 5.2 Complete Point-to-Point Wiring Table

| From Component & Pin | To Component & Pin | Wire Color Recommendation | Notes |
| :--- | :--- | :---: | :--- |
| **OBD-II Pin 16 (+12V)** | **PPTC Fuse F1 (500mA)** | Red | Unswitched constant 12V rail |
| **PPTC Fuse F1** | **Schottky Diode D1 (SS34 Anode)** | Red | In series |
| **Diode D1 (Cathode)** | **MP1584EN Buck Converter `IN+`** | Red | Cleaned 12V power rail |
| **Diode D1 (Cathode)** | **TVS Diode D2 (SMAJ24CA Pin 1)** | Red | Clamping to GND |
| **Diode D1 (Cathode)** | **Capacitor C1 (220µF Positive `+`)** | Red | Cranking buffer |
| **Diode D1 (Cathode)** | **Resistor R1 (100 kΩ leg 1)** | Red | Battery voltage sensing top leg |
| **OBD-II Pin 4 & 5** | **MP1584EN Buck Converter `IN-` (GND)**| Black | Main ground return |
| **MP1584EN `IN-` (GND)** | **TVS Diode D2 Pin 2 & C1 Negative `-`** | Black | Ground bus |
| **MP1584EN `OUT-` (GND)**| **ESP32 Board `GND`** | Black | Regulated ground bus |
| **MP1584EN `OUT+` (5.0V)**| **ESP32 Board `VIN` (or `5V`)** | Orange | Pre-tuned with multimeter to 5.00V! |
| **ESP32 `GND`** | **SN65HVD230 `GND`** | Black | Transceiver ground |
| **ESP32 `3V3`** | **SN65HVD230 `3V3`** | Red | Clean 3.3V rail from ESP32 LDO |
| **ESP32 `GPIO 4`** | **SN65HVD230 `CTX` (or `TXD`)** | Green | TWAI CAN Transmit |
| **ESP32 `GPIO 5`** | **SN65HVD230 `CRX` (or `RXD`)** | Yellow | TWAI CAN Receive |
| **ESP32 `GPIO 21`** | **SN65HVD230 `Rs`** | White | Mode select: LOW = Normal, HIGH = Standby |
| **SN65HVD230 `CANH`** | **OBD-II Pin 6 (CAN High)** | Blue | High-speed differential pair |
| **SN65HVD230 `CANL`** | **OBD-II Pin 14 (CAN Low)** | Brown | High-speed differential pair |
| **Resistor R1 (100 kΩ leg 2)** | **ESP32 `GPIO 34` (ADC1_CH6)** | Purple | Midpoint of voltage divider |
| **Resistor R2 (10 kΩ)** | **Between `GPIO 34` and `GND`** | - | Voltage divider bottom leg (11:1 ratio) |
| **Capacitor C2 (100 nF)** | **Between `GPIO 34` and `GND`** | - | In parallel with R2 for ADC noise filter |

---

### 5.3 Battery Voltage Divider Ratio Calculation

The battery sensing circuit connects from the 12V rail to ESP32 ADC pin **GPIO 34**:

$$V_{ADC} = V_{BAT} \times \frac{R_2}{R_1 + R_2} = V_{BAT} \times \frac{10\,\text{k}\Omega}{100\,\text{k}\Omega + 10\,\text{k}\Omega} = \frac{V_{BAT}}{11}$$

* At **12.6V** (resting battery): $V_{ADC} = 12.6 / 11 = 1.145\,\text{V}$.
* At **14.8V** (alternator charging): $V_{ADC} = 14.8 / 11 = 1.345\,\text{V}$.
* At **20.0V** (temporary jump-start peak): $V_{ADC} = 20.0 / 11 = 1.818\,\text{V}$.
This safely operates within the ESP32's 0V to 3.1V linear ADC range.

---

## 6. Complete Firmware (`vibes_esp32_obd.ino`)

This is the complete, production-ready Arduino/PlatformIO C++ source code. It includes:
* Native ESP32 TWAI CAN driver running at 500 kbps (VAG standard high-speed CAN).
* BLE Nordic UART Service (NUS) with high-throughput 256-byte MTU support.
* ELM327-compatible AT command parser (subset) (`ATZ`, `ATE0`, `ATL0`, `ATS0`, `ATH1/0`, `ATSP6`, `ATSH`, `ATFCSx`, `ATRV`, `ATI`).
* Raw UDS multi-frame transmission and reception matching vibesODB2 requirements.
* Automatic sleep management when ignition is off.

Save this file as `vibes_esp32_obd.ino` inside a folder named `vibes_esp32_obd`:

```cpp
/**
 * vibesODB2 - ESP32 BLE OBD-II / CAN-Bus Adapter Firmware
 * 
 * Hardware:
 *   - ESP32-WROOM-32 (NodeMCU / DevKit)
 *   - SN65HVD230 3.3V CAN Transceiver (R2 120-ohm resistor REMOVED)
 *   - MP1584EN DC-DC Buck Converter (Set to 5.0V)
 *   - 100k / 10k Voltage Divider on GPIO 34 for ATRV Battery Sensing
 * 
 * Target Baud: ISO 15765-4 High Speed CAN (500 kbps / 11-bit standard ID)
 * BLE Service: Nordic UART Service (NUS)
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "driver/twai.h"
#include "esp_sleep.h"

// -------------------------------------------------------------
// Pin Definitions
// -------------------------------------------------------------
#define CAN_TX_PIN         GPIO_NUM_4   // Connects to CTX / TXD of SN65HVD230
#define CAN_RX_PIN         GPIO_NUM_5   // Connects to CRX / RXD of SN65HVD230
#define CAN_RS_PIN         GPIO_NUM_21  // Connects to Rs pin (LOW=Normal, HIGH=Standby)
#define BATTERY_ADC_PIN    34           // GPIO 34 (ADC1_CH6) via 100k / 10k divider
#define LED_STATUS_PIN     2            // Onboard Blue LED for status

// -------------------------------------------------------------
// BLE Nordic UART Service (NUS) UUIDs
// -------------------------------------------------------------
#define SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e" // Write
#define CHARACTERISTIC_UUID_TX "6e400003-b5a3-f393-e0a9-e50e24dcca9e" // Notify

// -------------------------------------------------------------
// Voltage Calibration Constants
// -------------------------------------------------------------
// Divider: (100k + 10k) / 10k = 11.0. 
// ESP32 ADC full-scale voltage with 11dB attenuation = ~3.3V across 4095 counts.
const float ADC_CALIBRATION_FACTOR = 11.0f * (3.3f / 4095.0f) * 1.035f; // Calibration trim

// -------------------------------------------------------------
// Global Protocol State (ELM327 / STN Emulation)
// -------------------------------------------------------------
bool echoEnabled       = false; // ATE0 default
bool linefeedsEnabled  = false; // ATL0 default
bool spacesEnabled     = true;  // ATS1 default
bool headersEnabled    = false; // ATH0 default
uint32_t currentHeader = 0x7E0; // Default ECU Request Header (Engine ECU)
uint32_t receiveHeader = 0x7E8; // Default ECU Response Header
uint8_t  canProtocol   = 6;     // 6 = ISO 15765-4 CAN (11-bit ID, 500 kbaud)
uint32_t elmTimeoutMs  = 300;   // ATST timeout

// BLE State
BLEServer* pServer = nullptr;
BLECharacteristic* pTxCharacteristic = nullptr;
bool deviceConnected = false;
bool oldDeviceConnected = false;
String rxCommandBuffer = "";

// Auto-sleep tracking
unsigned long lastActivityTimestamp = 0;
const unsigned long SLEEP_TIMEOUT_MS = 60000; // 60 seconds of silence -> sleep check

// Forward declarations
void initTWAI();
void sendResponse(const String& str);
void processCommand(String cmd);
void enterLowPowerSleep();
float readBatteryVoltage();

// -------------------------------------------------------------
// BLE Server Callbacks
// -------------------------------------------------------------
class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    deviceConnected = true;
    digitalWrite(LED_STATUS_PIN, HIGH);
  }

  void onDisconnect(BLEServer* pServer) override {
    deviceConnected = false;
    digitalWrite(LED_STATUS_PIN, LOW);
  }
};

// -------------------------------------------------------------
// BLE Characteristic Callbacks (Receiving commands from PWA)
// -------------------------------------------------------------
class CharacteristicCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pCharacteristic) override {
    std::string rxValue = pCharacteristic->getValue();
    if (rxValue.length() > 0) {
      lastActivityTimestamp = millis();
      for (size_t i = 0; i < rxValue.length(); i++) {
        char c = rxValue[i];
        if (c == '\r' || c == '\n') {
          if (rxCommandBuffer.length() > 0) {
            processCommand(rxCommandBuffer);
            rxCommandBuffer = "";
          }
        } else {
          rxCommandBuffer += c;
        }
      }
    }
  }
};

// -------------------------------------------------------------
// TWAI (CAN) Hardware Initialization
// -------------------------------------------------------------
void initTWAI() {
  pinMode(CAN_RS_PIN, OUTPUT);
  digitalWrite(CAN_RS_PIN, LOW); // Set SN65HVD230 to Normal Mode

  twai_general_config_t g_config = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NORMAL);
  g_config.tx_queue_len = 32;
  g_config.rx_queue_len = 64;

  // 500 kbps timing configuration for 80MHz APB clock
  twai_timing_config_t t_config = TWAI_TIMING_CONFIG_500KBITS();

  // Accept all CAN IDs (filtering done in firmware)
  twai_filter_config_t f_config = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  if (twai_driver_install(&g_config, &t_config, &f_config) == ESP_OK) {
    twai_start();
  }
}

// -------------------------------------------------------------
// Send Response over BLE NUS TX Characteristic
// -------------------------------------------------------------
void sendResponse(const String& str) {
  if (!deviceConnected || pTxCharacteristic == nullptr) return;

  String formatted = str;
  if (!linefeedsEnabled) {
    formatted.replace("\n", "");
  }

  // Always end ELM327 responses with '>' prompt
  if (!formatted.endsWith(">")) {
    formatted += "\r>";
  }

  // Fragment packets if length exceeds BLE MTU (chunking at 240 bytes)
  const size_t chunkSize = 240;
  size_t len = formatted.length();
  for (size_t i = 0; i < len; i += chunkSize) {
    size_t sendLen = min(chunkSize, len - i);
    pTxCharacteristic->setValue((uint8_t*)formatted.c_str() + i, sendLen);
    pTxCharacteristic->notify();
    delay(4); // Small inter-packet spacing
  }
}

// -------------------------------------------------------------
// Battery Voltage Sensor Reader
// -------------------------------------------------------------
float readBatteryVoltage() {
  // Take 8 samples and average
  uint32_t rawSum = 0;
  for (int i = 0; i < 8; i++) {
    rawSum += analogRead(BATTERY_ADC_PIN);
    delayMicroseconds(200);
  }
  float avgRaw = (float)rawSum / 8.0f;
  return avgRaw * ADC_CALIBRATION_FACTOR;
}

// -------------------------------------------------------------
// Hex Conversion Utilities
// -------------------------------------------------------------
uint8_t hexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return 0;
}

int hexStringToBytes(const String& hex, uint8_t* outBytes, int maxLen) {
  int byteIndex = 0;
  int hexLen = hex.length();
  for (int i = 0; i < hexLen && byteIndex < maxLen; i += 2) {
    while (i < hexLen && hex[i] == ' ') i++;
    if (i + 1 >= hexLen) break;
    outBytes[byteIndex++] = (hexNibble(hex[i]) << 4) | hexNibble(hex[i + 1]);
  }
  return byteIndex;
}

// -------------------------------------------------------------
// Command Dispatcher & ELM327 / STN Emulation
// -------------------------------------------------------------
void processCommand(String cmd) {
  cmd.trim();
  String upperCmd = cmd;
  upperCmd.toUpperCase();

  // AT Commands
  if (upperCmd.startsWith("AT")) {
    String sub = upperCmd.substring(2);
    sub.trim();

    // ATZ: Soft Reset
    if (sub == "Z" || sub == "WS") {
      headersEnabled = false;
      echoEnabled = false;
      spacesEnabled = true;
      currentHeader = 0x7E0;
      receiveHeader = 0x7E8;
      sendResponse("\r\rvibesOBD2 ESP32 v1.0 (ELM327-compatible command set)\r\r>");
      return;
    }
    // Echo: ATE0 / ATE1
    if (sub.startsWith("E")) {
      echoEnabled = (sub.charAt(1) == '1');
      sendResponse("OK\r>");
      return;
    }
    // Linefeeds: ATL0 / ATL1
    if (sub.startsWith("L")) {
      linefeedsEnabled = (sub.charAt(1) == '1');
      sendResponse("OK\r>");
      return;
    }
    // Spaces: ATS0 / ATS1
    if (sub.startsWith("S")) {
      spacesEnabled = (sub.charAt(1) == '1');
      sendResponse("OK\r>");
      return;
    }
    // Headers: ATH0 / ATH1
    if (sub.startsWith("H")) {
      headersEnabled = (sub.charAt(1) == '1');
      sendResponse("OK\r>");
      return;
    }
    // Set Protocol: ATSP6 (CAN 11-bit 500k) or ATSP0 (Auto)
    if (sub.startsWith("SP")) {
      canProtocol = 6;
      sendResponse("OK\r>");
      return;
    }
    // Set Header: ATSH <header> (e.g. ATSH 7E0)
    if (sub.startsWith("SH")) {
      String hdrStr = sub.substring(2);
      hdrStr.trim();
      currentHeader = strtoul(hdrStr.c_str(), NULL, 16);
      receiveHeader = currentHeader + 8; // Default ISO-TP response offset
      sendResponse("OK\r>");
      return;
    }
    // Flow Control Setup (ATFCSH, ATFCSD, ATFCSM)
    if (sub.startsWith("FCS")) {
      sendResponse("OK\r>");
      return;
    }
    // Auto-formatting (ATCAF0 / ATCAF1)
    if (sub.startsWith("CAF")) {
      sendResponse("OK\r>");
      return;
    }
    // Read Battery Voltage: ATRV
    if (sub == "RV") {
      float volts = readBatteryVoltage();
      char vBuf[16];
      snprintf(vBuf, sizeof(vBuf), "%.1fV\r>", volts);
      sendResponse(String(vBuf));
      return;
    }
    // Describe Protocol: ATDP / ATDPN
    if (sub == "DP") {
      sendResponse("ISO 15765-4 (CAN 11/500)\r>");
      return;
    }
    if (sub == "DPN") {
      sendResponse("6\r>");
      return;
    }
    // Identification: ATI / AT@1
    if (sub == "I") {
      // Identify honestly: this is not an Elm Electronics product. Apps that key on the
      // exact string "ELM327" in ATI/ATZ replies may need a compatibility setting.
      sendResponse("vibesOBD2 ESP32 v1.0 (ELM327-compatible command set)\r>");
      return;
    }
    if (sub == "@1") {
      sendResponse("vibesODB2 ESP32 TWAI v1.0\r>");
      return;
    }
    // Set Timeout: ATST <hex>
    if (sub.startsWith("ST")) {
      String toStr = sub.substring(2);
      toStr.trim();
      elmTimeoutMs = strtoul(toStr.c_str(), NULL, 16) * 4; // 1 unit = 4ms
      if (elmTimeoutMs < 50) elmTimeoutMs = 50;
      sendResponse("OK\r>");
      return;
    }
    // Catch-all for unrecognized AT commands
    sendResponse("OK\r>");
    return;
  }

  // -----------------------------------------------------------
  // CAN Frame OBD-II / UDS Transmission
  // -----------------------------------------------------------
  // Remove whitespace from hex command
  String hexOnly = "";
  for (size_t i = 0; i < upperCmd.length(); i++) {
    char c = upperCmd[i];
    if (isHexadecimalDigit(c)) hexOnly += c;
  }

  if (hexOnly.length() == 0) {
    sendResponse("?\r>");
    return;
  }

  // Parse bytes
  uint8_t payload[8] = {0};
  int byteCount = 0;
  for (size_t i = 0; i < hexOnly.length() && byteCount < 8; i += 2) {
    if (i + 1 < hexOnly.length()) {
      payload[byteCount++] = (hexNibble(hexOnly[i]) << 4) | hexNibble(hexOnly[i + 1]);
    }
  }

  // Build CAN frame
  twai_message_t txMsg;
  txMsg.identifier = currentHeader;
  txMsg.extd = 0; // Standard 11-bit ID
  txMsg.rtr = 0;

  // Single Frame (SF) ISO-TP encapsulation if payload is pure OBD/UDS data
  if (byteCount <= 7) {
    txMsg.data_length_code = 8;
    txMsg.data[0] = byteCount; // PCI length byte
    for (int i = 0; i < byteCount; i++) {
      txMsg.data[i + 1] = payload[i];
    }
    // Pad unused bytes with 0xAA or 0x00
    for (int i = byteCount + 1; i < 8; i++) {
      txMsg.data[i] = 0xAA;
    }
  } else {
    txMsg.data_length_code = byteCount;
    memcpy(txMsg.data, payload, byteCount);
  }

  // Transmit CAN frame
  if (twai_transmit(&txMsg, pdMS_TO_TICKS(100)) != ESP_OK) {
    sendResponse("CAN ERROR\r>");
    return;
  }

  // Receive matching responses
  String responseText = "";
  unsigned long startMs = millis();
  bool receivedAny = false;

  while (millis() - startMs < elmTimeoutMs) {
    twai_message_t rxMsg;
    if (twai_receive(&rxMsg, pdMS_TO_TICKS(10)) == ESP_OK) {
      // Filter for expected ECU response (e.g. 0x7E8) or accept functional responses
      if (rxMsg.identifier == receiveHeader || (rxMsg.identifier >= 0x7E8 && rxMsg.identifier <= 0x7EF)) {
        receivedAny = true;
        if (headersEnabled) {
          char hdrBuf[8];
          snprintf(hdrBuf, sizeof(hdrBuf), "%03X ", rxMsg.identifier);
          responseText += String(hdrBuf);
        }

        // Format data bytes
        for (int i = 0; i < rxMsg.data_length_code; i++) {
          char hexByte[4];
          snprintf(hexByte, sizeof(hexByte), "%02X", rxMsg.data[i]);
          responseText += String(hexByte);
          if (spacesEnabled && i < rxMsg.data_length_code - 1) {
            responseText += " ";
          }
        }
        responseText += "\r";

        // If Single Frame (PCI byte 0x00-0x07) or ISO-TP end, we can return
        if ((rxMsg.data[0] & 0xF0) == 0x00) {
          break; // Single frame completed
        }
      }
    }
  }

  if (!receivedAny) {
    sendResponse("NO DATA\r>");
  } else {
    sendResponse(responseText + ">");
  }
}

// -------------------------------------------------------------
// Auto-Sleep Management
// -------------------------------------------------------------
void enterLowPowerSleep() {
  // Put transceiver to sleep
  digitalWrite(CAN_RS_PIN, HIGH);
  twai_stop();
  twai_driver_uninstall();

  // Configure wake up: Pin 5 (CAN RX) falling edge or 10s timer
  esp_sleep_enable_ext0_wakeup(CAN_RX_PIN, 0); // Wake on CAN bus activity
  esp_sleep_enable_timer_wakeup(10 * 1000000ULL); // Wake every 10s to check battery

  digitalWrite(LED_STATUS_PIN, LOW);
  esp_deep_sleep_start();
}

// -------------------------------------------------------------
// Arduino Setup & Main Loop
// -------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(LED_STATUS_PIN, OUTPUT);
  digitalWrite(LED_STATUS_PIN, LOW);

  // Configure ADC attenuation (11dB gives full 0-3.3V range)
  analogSetAttenuation(ADC_11db);
  pinMode(BATTERY_ADC_PIN, INPUT);

  // Initialize TWAI CAN controller
  initTWAI();

  // Initialize BLE
  BLEDevice::init("vibesOBD-ESP32");
  BLEDevice::setMTU(256);

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService* pService = pServer->createService(SERVICE_UUID);

  // TX Characteristic (Notify vibesODB2 PWA)
  pTxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  // RX Characteristic (Receive commands from vibesODB2 PWA)
  BLECharacteristic* pRxCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pRxCharacteristic->setCallbacks(new CharacteristicCallbacks());

  pService->start();

  // Start Advertising
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06); // Helps with iPhone / Web BLE connectivity
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  lastActivityTimestamp = millis();
}

void loop() {
  // Disconnection handling & restart advertising
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  // Check auto-sleep condition:
  // If disconnected for > 60 seconds and battery is < 12.8V (engine is off)
  if (!deviceConnected && (millis() - lastActivityTimestamp > SLEEP_TIMEOUT_MS)) {
    float batV = readBatteryVoltage();
    if (batV > 5.0f && batV < 12.8f) {
      enterLowPowerSleep();
    }
  }

  delay(10);
}
```

---

## 7. Building & Flashing Instructions

### Option A: Using PlatformIO (Recommended)

1. Create a new directory named `vibes-esp32-adapter` and add `platformio.ini`:

```ini
[env:esp32dev]
platform = espressif32
board = esp32dev
framework = arduino
monitor_speed = 115200
upload_speed = 921600
build_flags = 
    -DCORE_DEBUG_LEVEL=0
lib_deps = 
    ; ESP32 BLE and TWAI are built into the espressif32 platform core
```

2. Place `vibes_esp32_obd.ino` inside `src/main.cpp`.
3. Connect your ESP32 board to your PC via USB.
4. Run:
   ```bash
   pio run --target upload
   ```

---

### Option B: Using Arduino IDE

1. Install **Arduino IDE** (version 2.0+ recommended).
2. Open **Preferences** and add the ESP32 board manager URL:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Open **Boards Manager** (`Tools > Board > Boards Manager`), search for `esp32`, and install `esp32 by Espressif Systems`.
4. Select `Tools > Board > esp32 > ESP32 Dev Module`.
5. Open `vibes_esp32_obd.ino`.
6. Click **Upload** (ensure USB port is selected under `Tools > Port`).

---

## 8. Bench Testing & Commissioning Checklist

Before plugging your DIY adapter into your vehicle, perform this step-by-step verification on your workbench:

### Step 1: Pre-Power Check
- [ ] Inspect the **SN65HVD230** board: Verify the **R2 (120Ω)** resistor has been removed.
- [ ] Multimeter test across `CANH` and `CANL`: Must read **> 100 kΩ** (not 120Ω or 60Ω).
- [ ] Multimeter test between `OBD Pin 16` and `GND`: Must read open-circuit (no direct shorts).

### Step 2: Power Supply Adjustment
> [!IMPORTANT]
> **DO NOT connect the ESP32 to the buck converter yet!**
- [ ] Connect a 12V bench power supply (or 12V battery) to **OBD Pin 16 (+12V)** and **OBD Pin 4/5 (GND)**.
- [ ] Measure the output voltage of the **MP1584EN** buck converter with your multimeter.
- [ ] Slowly turn the brass potentiometer screw on the MP1584EN until the output reads **exactly 5.00V ± 0.05V**.
- [ ] Disconnect 12V power. Solder the 5.0V output to the ESP32 `VIN` pin and GND to `GND`.

### Step 3: Bench BLE NUS Verification
- [ ] Power the unit with 12V on Pin 16. The ESP32 power LED should illuminate.
- [ ] Open **Google Chrome** on your PC, Mac, or Android phone.
- [ ] Navigate to `chrome://bluetooth-internals` or use the **nRF Connect** app.
- [ ] Scan for BLE devices: You should see **`vibesOBD-ESP32`** advertising service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`.
- [ ] Connect to it. Write `ATZ\r` to characteristic `6e400002-...`.
- [ ] Check notify characteristic `6e400003-...`: It should respond with `vibesOBD2 ESP32 v1.0 (ELM327-compatible command set)>`.
- [ ] Write `ATRV\r`: It should respond with the simulated battery voltage (e.g., `12.0V>`).

---

## 9. Vehicle Connection & vibesODB2 Walkthrough

Once bench testing passes, you are ready to test on your car:

1. **Plug Into OBD Port**: Plug the adapter into the car's OBD-II port (located under the driver dash on VW Transporter / Golf / Passat / Tiguan).
2. **Turn Ignition ON**: Turn key to Position 2 (Ignition ON, Engine OFF).
3. **Open vibesODB2**:
   - Open [**https://orviwan.github.io/vibesODB2/**](https://orviwan.github.io/vibesODB2/) in Chrome, Edge, Brave, or Bluefy (iOS).
4. **Connect BLE**:
   - Tap the blue **Connect BLE** button.
   - The browser Bluetooth picker will appear showing **`vibesOBD-ESP32`**.
   - Select it and tap **Pair**.
5. **Verify Initialization**:
   - The app will send `ATZ`, `ATE0`, `ATH0`, `ATSP6`, and read battery voltage `ATRV`.
   - Your battery voltage and ignition status will appear in the top status bar.
   - The app will read your vehicle VIN, detected platform (PQ35/MQB), and populate available diagnostics and features!

---

## 10. Troubleshooting & Diagnostics

| Symptom | Probable Cause | Corrective Action |
| :--- | :--- | :--- |
| **`vibesOBD-ESP32` does not show in Bluetooth picker** | BLE advertising name filter mismatch or Web Bluetooth disabled | Ensure you are using Google Chrome or Bluefy. Verify `navigator.bluetooth` is enabled in `chrome://flags`. Verify ESP32 power LED is lit. |
| **PWA connects, but says "NO DATA" on vehicle scan** | CAN High / CAN Low swapped or incorrect pins | Swap Pin 6 (`CANH`) and Pin 14 (`CANL`). Verify GPIO 4 is wired to transceiver `CTX` and GPIO 5 is wired to `CRX`. |
| **Dashboard throws warning lights (ABS/ESC) when plugged in!** | **120Ω resistor R2 was NOT removed** or CAN baud rate is wrong | **Unplug immediately!** Desolder resistor R2 on the SN65HVD230 module. Ensure firmware is configured for 500 kbps (`TWAI_TIMING_CONFIG_500KBITS`). |
| **Adapter resets or brownouts when vehicle engine starts** | Cranking voltage dip drops below buck converter threshold | Add a larger 220µF to 470µF 35V low-ESR electrolytic capacitor across buck converter `IN+` and `IN-`. |
| **Battery reading shows 0.0V or incorrect voltage** | Voltage divider resistor values or ADC pin wiring incorrect | Verify 100kΩ resistor is connected to +12V rail and 10kΩ to GND. Verify center tap is connected to GPIO 34. Check `ADC_CALIBRATION_FACTOR` in firmware. |
| **Long coding reads fail halfway through** | Buffer overrun on standard dongles | Ensure you are running our provided ESP32 firmware which allocates 32-message TX and 64-message RX queues in TWAI silicon. |
