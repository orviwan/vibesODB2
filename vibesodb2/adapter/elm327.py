"""
ELM327 / STN2120 / vLinker adapter protocol driver and arbitration manager.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from vibesodb2.ble.transport import Transport

logger = logging.getLogger(__name__)


@dataclass
class ModuleAddressConfig:
    name: str
    address: int
    tx_header: str
    rx_filter: str
    default_coding_did: int
    description: str


# VAG 11-bit CAN arbitration IDs (ISO 15765-4, 500 kbit/s).
# This table must stay identical to the `verified: true` entries of MODULE_ARBITRATION in
# pwa/js/uds.js; tests/test_module_table.py enforces it. Modules whose IDs have not been
# verified are intentionally absent: use set_custom_arbitration() with explicit IDs.
MODULE_REGISTRY: Dict[int, ModuleAddressConfig] = {
    0x01: ModuleAddressConfig("Engine Control Module", 0x01, "7E0", "7E8", 0x0600,
                              "Engine Control Unit managing ignition, fuel injection, turbocharging, and emissions."),
    0x02: ModuleAddressConfig("Transmission Control Module", 0x02, "7E1", "7E9", 0x0600,
                              "Automatic / DSG gearbox controller."),
    0x03: ModuleAddressConfig("Brake Electronics (ABS/ESP)", 0x03, "713", "77D", 0x0600,
                              "Anti-lock braking system, traction control, and stability program."),
    0x08: ModuleAddressConfig("Climate Control (HVAC)", 0x08, "746", "7B0", 0x0600,
                              "Heating, ventilation and air-conditioning control module."),
    0x09: ModuleAddressConfig("Central Electric (BCM)", 0x09, "70E", "778", 0x0600,
                              "Body Control Module controlling lighting, wipers, central locking, and power distribution."),
    0x15: ModuleAddressConfig("Airbag Control Unit", 0x15, "715", "77F", 0x0600,
                              "Supplemental Restraint System (SRS) airbag crash sensors and igniters."),
    0x17: ModuleAddressConfig("Instrument Cluster", 0x17, "714", "77E", 0x0600,
                              "Instrument gauge cluster, warning indicators, and multifunction display."),
    0x19: ModuleAddressConfig("CAN Gateway", 0x19, "710", "77A", 0x0600,
                              "Inter-bus gateway coordinating Powertrain, Convenience, and Infotainment CAN buses."),
    0x44: ModuleAddressConfig("Power Steering", 0x44, "712", "77C", 0x0600,
                              "Electromechanical power steering assist controller."),
}


class ELM327Adapter:
    """
    Manages communication with the OBD-II adapter hardware using AT/ST commands.
    Configures CAN arbitration headers and filters for target modules.
    """

    def __init__(self, transport: Transport):
        self.transport = transport
        self.current_module: Optional[ModuleAddressConfig] = None
        self.device_version: str = ""
        self.voltage: str = ""

    async def initialize(self) -> str:
        """
        Execute the phase 2 hardware initialization sequence:
        ATZ -> ATE0 -> ATS0 -> ATL0 -> ATCAF1 -> ATSP6
        """
        logger.info("Initializing adapter hardware...")

        # 1. Reset chip
        resp_atz = await self.transport.send_command("ATZ", timeout=3.0)
        self.device_version = resp_atz.replace("\r", " ").replace("\n", " ").strip()
        logger.info("Adapter identification: %s", self.device_version)

        # 2. Echo off
        await self.send_at_expect_ok("ATE0")

        # 3. Spaces off
        await self.send_at_expect_ok("ATS0")

        # 4. Linefeeds off
        await self.send_at_expect_ok("ATL0")

        # 5. CAN Auto Formatting on (enables hardware ISO-TP reassembly)
        await self.send_at_expect_ok("ATCAF1")

        # 6. Set protocol to ISO 15765-4 (CAN 11-bit, 500 kbaud)
        await self.send_at_expect_ok("ATSP6")

        # Read voltage
        try:
            self.voltage = await self.transport.send_command("ATRV", timeout=2.0)
            logger.info("Battery Voltage: %s", self.voltage)
        except Exception:
            self.voltage = "Unknown"

        return self.device_version

    async def send_at_expect_ok(self, cmd: str, timeout: float = 3.0) -> str:
        """Send an AT command and verify OK response."""
        resp = await self.transport.send_command(cmd, timeout=timeout)
        clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
        if "OK" not in clean and clean != "":
            logger.warning("Command '%s' expected 'OK' but got: %r", cmd, resp)
        return resp

    async def set_module_address(self, module_address: int) -> ModuleAddressConfig:
        """
        Dynamically configures CAN transmit header (ATSH) and receive filter (ATCRA)
        for the target controller.
        """
        if module_address not in MODULE_REGISTRY:
            raise ValueError(f"Module address 0x{module_address:02X} is not registered in vehicle profile.")

        config = MODULE_REGISTRY[module_address]
        logger.info("Setting CAN arbitration for %s (0x%02X): ATSH %s, ATCRA %s",
                    config.name, config.address, config.tx_header, config.rx_filter)

        await self.send_at_expect_ok(f"ATSH {config.tx_header}")
        await self.send_at_expect_ok(f"ATCRA {config.rx_filter}")
        self.current_module = config
        return config

    async def set_custom_arbitration(self, tx_header: str, rx_filter: str) -> None:
        """Set custom transmit header and receive filter."""
        logger.info("Setting custom arbitration: ATSH %s, ATCRA %s", tx_header, rx_filter)
        await self.send_at_expect_ok(f"ATSH {tx_header}")
        await self.send_at_expect_ok(f"ATCRA {rx_filter}")

    async def read_engine_rpm(self) -> int:
        """
        Queries standard OBD-II PID 010C (Engine RPM).
        Used for the Engine-Off Safety Interlock.
        Formula: RPM = ((A * 256) + B) / 4.
        """
        # Save current header if we were targeting a specific ECU
        saved_header = self.current_module.tx_header if self.current_module else None
        saved_filter = self.current_module.rx_filter if self.current_module else None

        try:
            # Standard functional OBD-II request: 7DF
            await self.send_at_expect_ok("ATSH 7DF")
            await self.send_at_expect_ok("ATCRA")  # Clear filter for broad OBD-II response

            resp = await self.transport.send_command("010C", timeout=3.0)
            clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")

            # Typical response: "410CAABB"
            match = re.search(r"410C([0-9A-F]{4})", clean)
            if match:
                raw_val = int(match.group(1), 16)
                rpm = int(raw_val / 4)
                logger.debug("Read Engine RPM: %d", rpm)
                return rpm
            elif "NODATA" in clean or "STOPPED" in clean or "UNABLETOCONNECT" in clean:
                logger.warning("No OBD-II RPM response from vehicle bus.")
                return 0
            return 0
        finally:
            # Restore module arbitration if one was active
            if saved_header and saved_filter:
                await self.send_at_expect_ok(f"ATSH {saved_header}")
                await self.send_at_expect_ok(f"ATCRA {saved_filter}")

    async def send_uds_hex(self, hex_payload: str, timeout: float = 4.0) -> str:
        """
        Sends a raw UDS hex string over CAN and returns the normalized hex response.
        """
        clean_input = hex_payload.upper().replace(" ", "")
        resp = await self.transport.send_command(clean_input, timeout=timeout)
        clean_resp = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
        return clean_resp
