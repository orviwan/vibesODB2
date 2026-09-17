"""
Virtual ELM327 / STN2120 OBD-II Adapter Protocol Emulator.
Processes serial AT commands, standard OBD-II PIDs (Mode 01, 09),
ISO 14229 UDS services, and KWP2000 TP2.0 frames against a SimulatedVehicle.
"""

from __future__ import annotations

import logging
from typing import Optional

from vibesodb2.sim.vehicle import SimulatedVehicle

logger = logging.getLogger(__name__)

# Reverse map TX header hex (e.g. "70E") to Module address (e.g. 0x09)
HEADER_TO_MODULE = {
    "70E": 0x09,  # BCM
    "714": 0x17,  # Cluster
    "710": 0x19,  # Gateway
    "746": 0x08,  # Climate control
    "7E0": 0x01,  # Engine
    "7E1": 0x02,  # Transmission
    "713": 0x03,  # ABS
    "715": 0x15,  # Airbag
    "712": 0x44,  # Steering
}


class SimulatedELM327:
    """
    Virtual AT/ST OBD-II protocol handler connected to a SimulatedVehicle.
    """

    def __init__(self, vehicle: SimulatedVehicle):
        self.vehicle = vehicle

        # Protocol state
        self.echo = True
        self.spaces = True
        self.linefeeds = True
        self.can_formatting = True
        self.protocol = "6"  # ISO 15765-4 CAN 11/500
        self.tx_header = "7DF"
        self.rx_filter = ""
        self.active_session = 0x01

    @property
    def current_module_addr(self) -> int:
        header = self.tx_header.upper().strip()
        if header in HEADER_TO_MODULE:
            return HEADER_TO_MODULE[header]
        # Unknown or functional (7DF) header: no diagnostic module is addressed, as on a real bus.
        return None

    def process_command(self, cmd_str: str) -> str:
        """
        Takes raw string command (e.g. '010C' or 'ATZ'), evaluates state,
        and returns the formatted adapter response.
        """
        raw = cmd_str.strip()
        upper = raw.upper().replace(" ", "")

        if not upper:
            return "?"

        # =====================================================================
        # 1. AT Commands
        # =====================================================================
        if upper.startswith("ATZ") or upper == "ATWS":
            self.echo = True
            self.spaces = True
            self.linefeeds = True
            return "ELM327 v2.2"
        elif upper == "ATE0":
            self.echo = False
            return "OK"
        elif upper == "ATE1":
            self.echo = True
            return "OK"
        elif upper == "ATS0":
            self.spaces = False
            return "OK"
        elif upper == "ATS1":
            self.spaces = True
            return "OK"
        elif upper == "ATL0":
            self.linefeeds = False
            return "OK"
        elif upper == "ATL1":
            self.linefeeds = True
            return "OK"
        elif upper == "ATCAF1":
            self.can_formatting = True
            return "OK"
        elif upper == "ATCAF0":
            self.can_formatting = False
            return "OK"
        elif upper.startswith("ATSP"):
            self.protocol = upper[4:] or "6"
            return "OK"
        elif upper.startswith("ATSH"):
            self.tx_header = upper[4:]
            return "OK"
        elif upper.startswith("ATCRA"):
            self.rx_filter = upper[5:]
            return "OK"
        elif upper == "ATDP":
            return "ISO 15765-4 (CAN 11/500)"
        elif upper == "ATDPN":
            return "6"
        elif upper == "ATRV":
            return f"{self.vehicle.battery_voltage:.1f}V"
        elif upper.startswith("ATCS") or upper.startswith("ATH") or upper.startswith("ATM"):
            return "OK"
        elif upper.startswith("AT"):
            return "OK"

        # Update dynamic telemetry step
        sim = self.vehicle.update_physics()

        # =====================================================================
        # 2. Standard OBD-II Mode 01 PIDs
        # =====================================================================
        if upper == "0100":  # Supported PIDs 01-20
            return "4100BE3FA813"
        elif upper == "0120":  # Supported PIDs 21-40
            return "412080000001"
        elif upper == "010C":  # Engine RPM
            rpm = sim.rpm if sim else (self.vehicle.manual_rpm if self.vehicle.engine_running else 0)
            raw_val = int(rpm * 4)
            a = (raw_val >> 8) & 0xFF
            b = raw_val & 0xFF
            return f"410C{a:02X}{b:02X}"
        elif upper == "010D":  # Speed (km/h)
            spd = int(sim.speed) if sim else 0
            return f"410D{min(255, max(0, spd)):02X}"
        elif upper == "0105":  # Coolant Temp (°C = A - 40)
            ct = int(sim.coolant_temp) if sim else (88 if self.vehicle.engine_running else 22)
            return f"4105{min(255, max(0, ct + 40)):02X}"
        elif upper == "010B":  # MAP / Boost (kPa)
            map_kpa = int(sim.map_kpa) if sim else 101
            return f"410B{min(255, max(0, map_kpa)):02X}"
        elif upper == "0111":  # Throttle Position (%)
            th = int((sim.throttle * 255.0) / 100.0) if sim else 0
            return f"4111{min(255, max(0, th)):02X}"
        elif upper == "010F":  # Intake Air Temp (°C = A - 40)
            iat = int(sim.iat) if sim else 22
            return f"410F{min(255, max(0, iat + 40)):02X}"
        elif upper == "0123":  # Fuel Rail Pressure
            fr = int(sim.fuel_rail_bar * 10) if sim else 3200
            a = (fr >> 8) & 0xFF
            b = fr & 0xFF
            return f"4123{a:02X}{b:02X}"
        elif upper == "011F":  # Run Time Since Engine Start
            rt = int(sim.runtime_s) if sim else 120
            a = (rt >> 8) & 0xFF
            b = rt & 0xFF
            return f"411F{a:02X}{b:02X}"
        elif upper == "0142":  # Control Module Voltage (mV = 256A + B)
            mv = int(self.vehicle.battery_voltage * 1000)
            a = (mv >> 8) & 0xFF
            b = mv & 0xFF
            return f"4142{a:02X}{b:02X}"
        elif upper == "015E":  # Engine Fuel Rate (L/h = (256A+B)*0.05)
            fr_raw = int(self.vehicle.fuel_rate_l_h / 0.05)
            a = (fr_raw >> 8) & 0xFF
            b = fr_raw & 0xFF
            return f"415E{a:02X}{b:02X}"

        # =====================================================================
        # 3. Standard OBD-II Mode 09 (Vehicle Info)
        # =====================================================================
        if upper == "0902":  # Query VIN via OBD-II
            vin = self.vehicle.profile.vin
            vin_bytes = vin.encode("ascii")
            # Return multi-frame Mode 09 format:
            # 49 02 01 00 00 00 [VIN 1-3]
            # 49 02 02 [VIN 4-8]
            # 49 02 03 [VIN 9-13]
            # 49 02 04 [VIN 14-17]
            f1 = "490201000000" + vin_bytes[:3].hex().upper()
            f2 = "490202" + vin_bytes[3:8].hex().upper()
            f3 = "490203" + vin_bytes[8:13].hex().upper()
            f4 = "490204" + vin_bytes[13:17].hex().upper()
            return f"{f1}\r\n{f2}\r\n{f3}\r\n{f4}"

        # =====================================================================
        # 4. Mode 03 / 04 / 07 Emissions DTCs
        # =====================================================================
        if upper == "03":
            # Report emissions DTCs
            eng = self.vehicle.get_module(0x01)
            if eng and eng.dtcs:
                dtc_hex = "".join(d.code.replace("P", "") for d in eng.dtcs if d.code.startswith("P"))
                return f"43{len(eng.dtcs):02X}{dtc_hex}" if dtc_hex else "4300"
            return "4300"
        elif upper == "04":
            self.vehicle.clear_module_dtcs(0x01)
            return "44"

        # =====================================================================
        # 5. OEM VAG UDS Telemetry DIDs (Service 0x22)
        # =====================================================================
        if upper == "221154":  # DPF Soot Mass (0.01g)
            soot = int(self.vehicle.dpf_soot_g * 100)
            return f"621154{soot:04X}"
        elif upper == "221155":  # EGT before Turbo (°C = (val * 0.1) - 40)
            egt_c = sim.egt_c if sim else 280.0
            egt_val = int((egt_c + 40.0) * 10)
            return f"621155{egt_val:04X}"
        elif upper == "221156":  # Engaged Gear
            gear = sim.gear if sim else 0
            return f"621156{gear:02X}"

        # =====================================================================
        # 6. UDS Service 0x10 (DiagnosticSessionControl)
        # =====================================================================
        if upper == "1003":  # Extended Session
            self.active_session = 0x03
            return "5003003201F4"
        elif upper == "1001":  # Default Session
            self.active_session = 0x01
            return "5001003201F4"

        # =====================================================================
        # 7. UDS Service 0x3E (TesterPresent)
        # =====================================================================
        if upper == "3E80":
            return ""  # Suppress positive response
        elif upper == "3E00":
            return "7E00"

        # =====================================================================
        # 8. UDS Service 0x22 (ReadDataByIdentifier)
        # =====================================================================
        if upper.startswith("22"):
            did_hex = upper[2:6]
            mod = self.vehicle.get_module(self.current_module_addr)

            if did_hex == "F190":  # VIN
                vin_hex = self.vehicle.profile.vin.encode("ascii").hex().upper()
                return f"62F190{vin_hex}"
            elif did_hex == "F189":  # Software version
                sw = (mod.sw_version if mod else "0304").encode("ascii").hex().upper()
                return f"62F189{sw}"
            elif did_hex == "F187":  # Part number
                pn = (mod.part_number if mod else "7H0937087H").encode("ascii").hex().upper()
                return f"62F187{pn}"
            elif did_hex == "0600":  # Long Coding
                if mod and mod.coding:
                    return f"620600{mod.coding.hex().upper()}"
                return "7F2231"  # RequestOutOfRange

            return f"7F2231"

        # =====================================================================
        # 9. UDS Service 0x2E (WriteDataByIdentifier)
        # =====================================================================
        if upper.startswith("2E"):
            if self.vehicle.simulate_write_nrc:
                return f"7F2E{self.vehicle.simulate_write_nrc.upper()}"

            # Verify session
            if self.active_session != 0x03:
                return "7F2E7E"  # SubFunctionNotSupportedInActiveSession

            did_hex = upper[2:6]
            if did_hex == "0600":
                payload_hex = upper[6:]
                mod = self.vehicle.get_module(self.current_module_addr)
                if mod:
                    new_bytes = bytes.fromhex(payload_hex)
                    if len(new_bytes) != len(mod.coding):
                        return "7F2E13"  # IncorrectMessageLengthOrInvalidFormat
                    mod.coding = bytearray(new_bytes)
                    return "6E0600"
                return "7F2E31"

            return "7F2E31"

        # =====================================================================
        # 10. UDS Service 0x19 (ReadDTCInformation)
        # =====================================================================
        if upper.startswith("19"):
            mod = self.vehicle.get_module(self.current_module_addr)
            if not mod or not mod.dtcs:
                return "5902CF"  # Positive response, zero DTCs

            # Assemble DTC payload
            # Format: 59 02 CF [3 bytes DTC 1, 1 byte Status 1] ...
            payload = "5902CF"
            for d in mod.dtcs:
                if d.is_vag_decimal:
                    # Convert 5-digit decimal to 2-byte hex + FTB
                    dec_int = int(d.code)
                    ftb = d.failure_type_byte or 0x00
                    payload += f"{dec_int:04X}{ftb:02X}{d.status_mask:02X}"
                else:
                    # Standard SAE/UDS code (e.g. B104A15 or P0299)
                    # Use 3-byte representation
                    raw_dtc = d.code.replace("P", "0").replace("C", "4").replace("B", "8").replace("U", "C")
                    cleaned = raw_dtc.ljust(6, "0")[:6]
                    payload += f"{cleaned}{d.status_mask:02X}"

            return payload

        # =====================================================================
        # 11. UDS Service 0x14 (ClearDiagnosticInformation)
        # =====================================================================
        if upper.startswith("14"):
            if upper == "14FFFFFF":
                self.vehicle.clear_all_dtcs()
            else:
                self.vehicle.clear_module_dtcs(self.current_module_addr)
            return "54"

        # =====================================================================
        # 12. KWP2000 (over TP2.0) - Services 0x18, 0x1A, 0x14
        # =====================================================================
        if upper.startswith("18"):  # Read Fault Memory
            mod = self.vehicle.get_module(self.current_module_addr)
            if not mod or not mod.dtcs:
                return "5800"  # 0 DTCs

            count = len(mod.dtcs)
            res = f"58{count:02X}"
            for d in mod.dtcs:
                val = int(d.code) if d.is_vag_decimal else 0x0532
                ftb = d.failure_type_byte or 0x08
                res += f"{val:04X}{ftb:02X}"
            return res

        if upper.startswith("1A"):  # Read ECU Identification
            mod = self.vehicle.get_module(self.current_module_addr)
            pn = (mod.part_number if mod else "7H0937049K").encode("ascii").hex().upper()
            return f"5A{pn}"

        return f"7F{upper[:2]}11"  # ServiceNotSupported
