"""
High-fidelity Mock OBD-II Transport simulating a Vgate vLinker MC+ paired with
a VAG ECU network (PQ25 / PQ35 / MQB).
Enforces realistic timing, AT command responses, OBD-II PIDs, and UDS ISO-TP sessions.
Enables offline testing, automated unit tests, and UI development without physical hardware.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from vibesodb2.ble.transport import Transport

logger = logging.getLogger(__name__)

# Default realistic 30-byte T5.1 (7E0) BCM Long Coding payload
# Byte 00 to Byte 29 (30 bytes total)
DEFAULT_T51_BCM_CODING = bytes.fromhex(
    "B028403C0824240031140000282B0C400000410F60060000200000000000"
)

DEFAULT_VIN = "WV1ZZZ7EZEH012345"


class MockTransport(Transport):
    """
    Simulated BLE transport communicating with a virtual STN/ELM adapter and VW ECUs.
    """

    def __init__(
        self,
        engine_rpm: int = 0,
        initial_coding: Optional[bytes] = None,
        simulate_write_nrc: Optional[str] = None,
        simulate_timeout: bool = False,
        simulate_drive_cycle: bool = False,
        drive_cycle_mode: str = "city",
    ):
        self._connected = False
        self.engine_rpm = engine_rpm  # 0 = Ignition ON / Engine OFF
        self.bcm_coding = bytearray(initial_coding or DEFAULT_T51_BCM_CODING)
        self.cluster_coding = bytearray(bytes.fromhex("110F01"))
        self.vin = DEFAULT_VIN
        self.simulate_write_nrc = simulate_write_nrc  # e.g. "22" or "31"
        self.simulate_timeout = simulate_timeout
        self.simulate_drive_cycle = simulate_drive_cycle
        from vibesodb2.telemetry.drive_cycle import DriveCycleSimulator
        self.drive_cycle = DriveCycleSimulator(mode=drive_cycle_mode)

        # Adapter internal state
        self.echo = True
        self.spaces = True
        self.linefeeds = True
        self.can_formatting = True
        self.protocol = "6"
        self.tx_header = "7DF"
        self.rx_filter = ""
        self.active_session = 0x01  # 0x01 = default, 0x03 = extended
        self.dtcs = ["B104A15", "00532"]

        self._rx_buffer = bytearray()

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def connect(self) -> None:
        self._connected = True
        logger.debug("MockTransport connected.")

    async def disconnect(self) -> None:
        self._connected = False
        logger.debug("MockTransport disconnected.")

    async def send(self, data: bytes) -> None:
        if not self._connected:
            raise ConnectionError("MockTransport not connected.")

        cmd_str = data.decode("ascii", errors="replace").strip()
        response = self._process_command(cmd_str)

        if self.simulate_timeout:
            # Drop response to trigger timeout
            return

        formatted = (response + "\r\n>").encode("ascii")
        self._rx_buffer.extend(formatted)

    async def receive_until(self, delimiter: bytes = b">", timeout: float = 4.0) -> bytes:
        if not self._connected:
            raise ConnectionError("MockTransport not connected.")

        delim_pos = self._rx_buffer.find(delimiter)
        if delim_pos != -1:
            res = bytes(self._rx_buffer[: delim_pos + len(delimiter)])
            del self._rx_buffer[: delim_pos + len(delimiter)]
            return res

        await asyncio.sleep(0.01)
        delim_pos = self._rx_buffer.find(delimiter)
        if delim_pos != -1:
            res = bytes(self._rx_buffer[: delim_pos + len(delimiter)])
            del self._rx_buffer[: delim_pos + len(delimiter)]
            return res

        raise TimeoutError(f"MockTransport: timeout waiting for {delimiter!r}")

    def _process_command(self, cmd: str) -> str:
        upper = cmd.upper().replace(" ", "")

        # --- AT Commands ---
        if upper.startswith("ATZ"):
            self.echo = True
            self.spaces = True
            self.linefeeds = True
            return "ELM327 v2.2"
        elif upper.startswith("ATE0"):
            self.echo = False
            return "OK"
        elif upper.startswith("ATE1"):
            self.echo = True
            return "OK"
        elif upper.startswith("ATS0"):
            self.spaces = False
            return "OK"
        elif upper.startswith("ATS1"):
            self.spaces = True
            return "OK"
        elif upper.startswith("ATL0"):
            self.linefeeds = False
            return "OK"
        elif upper.startswith("ATL1"):
            self.linefeeds = True
            return "OK"
        elif upper.startswith("ATCAF1"):
            self.can_formatting = True
            return "OK"
        elif upper.startswith("ATCAF0"):
            self.can_formatting = False
            return "OK"
        elif upper.startswith("ATSP6"):
            self.protocol = "6"
            return "OK"
        elif upper.startswith("ATSP"):
            return "OK"
        elif upper.startswith("ATSH"):
            self.tx_header = upper[4:]
            return "OK"
        elif upper.startswith("ATCRA"):
            self.rx_filter = upper[5:]
            return "OK"
        elif upper.startswith("ATDP"):
            return "ISO 15765-4 (CAN 11/500)"
        elif upper.startswith("ATRV"):
            return "12.6V"
        elif upper.startswith("AT"):
            return "OK"

        # --- Standard OBD-II PIDs (Mode 01) ---
        sim = self.drive_cycle.update() if self.simulate_drive_cycle else None

        if upper == "010C":  # Engine RPM
            rpm_val = sim.rpm if sim else self.engine_rpm
            raw_val = int(rpm_val * 4)
            a = (raw_val >> 8) & 0xFF
            b = raw_val & 0xFF
            return f"410C{a:02X}{b:02X}"
        elif upper == "010D":  # Vehicle Speed (km/h)
            spd = int(sim.speed) if sim else 0
            return f"410D{min(255, max(0, spd)):02X}"
        elif upper == "0105":  # Coolant Temp (°C = A - 40)
            ct = int(sim.coolant_temp) if sim else 85
            return f"4105{min(255, max(0, ct + 40)):02X}"
        elif upper == "010B":  # MAP / Boost (kPa)
            map_val = int(sim.map_kpa) if sim else 101
            return f"410B{min(255, max(0, map_val)):02X}"
        elif upper == "0111":  # Throttle Position (%)
            th = int((sim.throttle * 255.0) / 100.0) if sim else 0
            return f"4111{min(255, max(0, th)):02X}"
        elif upper == "010F":  # Intake Air Temp (°C = A - 40)
            iat = int(sim.iat) if sim else 24
            return f"410F{min(255, max(0, iat + 40)):02X}"
        elif upper == "0123":  # Fuel Rail Pressure (bar = 10*(256A+B)/100 -> 256A+B = bar*10)
            fr = int(sim.fuel_rail_bar * 10) if sim else 3000
            a = (fr >> 8) & 0xFF
            b = fr & 0xFF
            return f"4123{a:02X}{b:02X}"
        elif upper == "011F":  # Run Time Since Start (s)
            rt = sim.runtime_s if sim else 120
            a = (rt >> 8) & 0xFF
            b = rt & 0xFF
            return f"411F{a:02X}{b:02X}"
        elif upper == "0142":  # Control Module Voltage
            return "41423138"
        elif upper == "0100":
            return "4100BE3FA813"

        # --- OEM VAG UDS Telemetry DIDs (Service 0x22) ---
        if upper == "221154":  # DPF Soot Mass (0.01g)
            soot_val = int((sim.dpf_soot_g if sim else 14.82) * 100)
            return f"621154{soot_val:04X}"
        elif upper == "221155":  # EGT before Turbo (°C = (val * 0.1) - 40)
            egt_val = int(((sim.egt_c if sim else 280.0) + 40.0) * 10)
            return f"621155{egt_val:04X}"
        elif upper == "221156":  # Engaged Gear
            gear_val = sim.gear if sim else 0
            return f"621156{gear_val:02X}"

        # --- UDS Service 0x10 (DiagnosticSessionControl) ---
        if upper == "1003":  # Extended Session
            self.active_session = 0x03
            return "5003003201F4"
        elif upper == "1001":  # Default Session
            self.active_session = 0x01
            return "5001003201F4"

        # --- UDS Service 0x3E (TesterPresent) ---
        if upper == "3E80":
            # Suppress positive response
            return ""
        elif upper == "3E00":
            return "7E00"

        # --- UDS Service 0x22 (ReadDataByIdentifier) ---
        if upper == "220600":
            if self.tx_header == "70E":  # BCM
                hex_data = self.bcm_coding.hex().upper()
                return f"620600{hex_data}"
            elif self.tx_header == "714":  # Cluster
                hex_data = self.cluster_coding.hex().upper()
                return f"620600{hex_data}"
            return f"620600{self.bcm_coding.hex().upper()}"
        elif upper == "22F190":  # VIN DID
            vin_hex = self.vin.encode("ascii").hex().upper()
            return f"62F190{vin_hex}"
        elif upper == "22F189":  # Software version
            return "62F18930333034"

        # --- UDS Service 0x2E (WriteDataByIdentifier) ---
        if upper.startswith("2E0600"):
            if self.simulate_write_nrc:
                # E.g. "22" (ConditionsNotCorrect) or "31" (RequestOutOfRange)
                return f"7F2E{self.simulate_write_nrc.upper()}"

            payload_hex = upper[6:]
            new_bytes = bytes.fromhex(payload_hex)
            if self.tx_header == "70E":
                self.bcm_coding = bytearray(new_bytes)
            elif self.tx_header == "714":
                self.cluster_coding = bytearray(new_bytes)
            return "6E0600"

        # --- UDS Service 0x19 (ReadDTCInformation) ---
        if upper.startswith("1902"):
            if self.dtcs:
                # Return mock DTC payload: 59 02 CF [DTC1 high, mid, low, status] [DTC2...]
                # DTC: 00532 -> Supply Voltage B+ (0x00 0x53 0x02)
                return "5902CF0053022FB104152F"
            return "5902CF"

        # --- UDS Service 0x14 (ClearDiagnosticInformation) ---
        if upper.startswith("14"):
            self.dtcs.clear()
            return "54"

        return "7F" + upper[:2] + "11"  # ServiceNotSupported
