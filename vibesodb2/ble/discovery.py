"""
BLE Device discovery and scanner for compatible OBD-II adapters.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional
from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from vibesodb2.ble.transport import NUS_SERVICE_UUID

logger = logging.getLogger(__name__)

KNOWN_ADAPTER_NAMES = [
    "vlinker",
    "obdlink",
    "ios-vlink",
    "v-link",
    "veepeak",
    "bimmercode",
    "carista",
]


@dataclass
class DiscoveredAdapter:
    name: str
    address: str
    rssi: int
    is_recommended: bool
    details: str = ""


async def scan_for_adapters(timeout: float = 5.0) -> List[DiscoveredAdapter]:
    """
    Scan for nearby BLE adapters and filter for known compatible OBD dongles or NUS advertisers.
    """
    logger.info("Scanning for BLE OBD-II adapters (duration: %.1fs)...", timeout)
    discovered: List[DiscoveredAdapter] = []

    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)

    for address, (device, adv_data) in devices.items():
        dev_name = device.name or adv_data.local_name or "Unknown Device"
        name_lower = dev_name.lower()

        # Check if known OBD adapter name or advertises NUS UUID
        service_uuids = [u.lower() for u in (adv_data.service_uuids or [])]
        has_nus = NUS_SERVICE_UUID in service_uuids

        is_known_adapter = any(keyword in name_lower for keyword in KNOWN_ADAPTER_NAMES)

        if is_known_adapter or has_nus:
            is_rec = "vlinker" in name_lower or "obdlink" in name_lower
            discovered.append(
                DiscoveredAdapter(
                    name=dev_name,
                    address=device.address,
                    rssi=adv_data.rssi,
                    is_recommended=is_rec,
                    details=f"Services: {len(service_uuids)}, NUS: {has_nus}",
                )
            )

    discovered.sort(key=lambda a: (a.is_recommended, a.rssi), reverse=True)
    logger.info("Found %d compatible BLE adapter(s).", len(discovered))
    return discovered
