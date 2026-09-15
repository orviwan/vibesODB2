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
    "android-vlink",
    "v-link",
    "veepeak",
    "bimmercode",
    "carista",
    "vgate",
    "icar",
    "obd",
    "elm327",
    "viecar",
    "tonwon",
    "konnwei",
    "bafx",
    "stn",
    "plx kiwi",
    "kiwi 3",
    "kiwi 4",
    "kiwi obd",
]

SERVICE_18F0_UUID = "000018f0-0000-1000-8000-00805f9b34fb".lower()


@dataclass
class DiscoveredAdapter:
    name: str
    address: str
    rssi: int
    is_recommended: bool
    details: str = ""
    is_obd: bool = True


async def scan_for_adapters(
    timeout: float = 5.0, include_all: bool = False
) -> List[DiscoveredAdapter]:
    """
    Scan for nearby BLE adapters and filter for known compatible OBD dongles or NUS advertisers.
    If include_all is True, also includes other detected BLE devices with names.
    """
    logger.info("Scanning for BLE OBD-II adapters (duration: %.1fs, include_all: %s)...", timeout, include_all)
    discovered: List[DiscoveredAdapter] = []

    devices = await BleakScanner.discover(timeout=timeout, return_adv=True)

    for address, (device, adv_data) in devices.items():
        dev_name = device.name or adv_data.local_name or ""
        name_lower = dev_name.lower()

        # Check if known OBD adapter name or advertises NUS/18F0 UUID
        service_uuids = [u.lower() for u in (adv_data.service_uuids or [])]
        has_nus = NUS_SERVICE_UUID in service_uuids
        has_18f0 = SERVICE_18F0_UUID in service_uuids

        is_known_adapter = any(keyword in name_lower for keyword in KNOWN_ADAPTER_NAMES)

        if is_known_adapter or has_nus or has_18f0:
            is_rec = any(k in name_lower for k in ("vlinker", "obdlink", "veepeak", "carista"))
            signal_quality = "Good" if adv_data.rssi > -75 else ("Fair" if adv_data.rssi > -88 else "Weak signal")
            discovered.append(
                DiscoveredAdapter(
                    name=dev_name or "OBD-II Adapter",
                    address=device.address,
                    rssi=adv_data.rssi,
                    is_recommended=is_rec,
                    details=f"{signal_quality} ({adv_data.rssi} dBm)",
                    is_obd=True,
                )
            )
        elif include_all and dev_name:
            discovered.append(
                DiscoveredAdapter(
                    name=dev_name,
                    address=device.address,
                    rssi=adv_data.rssi,
                    is_recommended=False,
                    details=f"Services: {len(service_uuids)}, RSSI: {adv_data.rssi} dBm",
                    is_obd=False,
                )
            )

    discovered.sort(key=lambda a: (a.is_recommended, a.is_obd, a.rssi), reverse=True)
    logger.info("Found %d BLE adapter(s).", len(discovered))
    return discovered

