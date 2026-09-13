"""
VAG Platform Taxonomy and VIN Auto-Detection Engine.
Identifies platform families (PQ25, PQ35, MQB) and vehicle models
across Volkswagen, Audi, SEAT, and Škoda.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class PlatformInfo:
    code: str  # e.g. "PQ25", "PQ35", "MQB"
    name: str  # e.g. "PQ25 Platform (Transporter T5.1/T6, Polo 6R)"
    chassis_code: str  # e.g. "7E"
    brand: str  # e.g. "Volkswagen Commercial Vehicles"
    model: str  # e.g. "Transporter T5.1 / T6"
    years: str  # e.g. "2010–2019"
    default_bcm_address: int = 0x09
    default_bcm_did: int = 0x0600
    expected_bcm_length: int = 30


# World Manufacturer Identifier (WMI) Mapping
WMI_MAP = {
    "WV1": "Volkswagen Commercial Vehicles",
    "WV2": "Volkswagen Commercial Vehicles (Bus/Van)",
    "WV3": "Volkswagen Commercial Vehicles",
    "WVW": "Volkswagen Passenger Cars",
    "WAU": "Audi",
    "TRU": "Audi Hungary",
    "VSS": "SEAT",
    "TMB": "Škoda",
    "TMP": "Škoda",
}

# Chassis code map: Positions 7 & 8 in standard 17-char VAG VIN
# Example: WV1ZZZ7EZEH012345 -> Pos 7-8 is "7E"
CHASSIS_CATALOG: Dict[str, Dict[str, str]] = {
    # --- PQ25 Platform ---
    "7E": {"platform": "PQ25", "model": "Transporter T5.1 / T6", "years": "2010–2019", "brand": "Volkswagen"},
    "7F": {"platform": "PQ25", "model": "Transporter T5.1 / T6 Chassis Cab", "years": "2010–2019", "brand": "Volkswagen"},
    "7H": {"platform": "PQ25", "model": "Transporter T5.1 / Multivan", "years": "2010–2015", "brand": "Volkswagen"},
    "7J": {"platform": "PQ25", "model": "Transporter T5.1 Dropside", "years": "2010–2015", "brand": "Volkswagen"},
    "6R": {"platform": "PQ25", "model": "Polo Mk5 (6R)", "years": "2009–2014", "brand": "Volkswagen"},
    "6C": {"platform": "PQ25", "model": "Polo Mk5 Facelift (6C)", "years": "2014–2017", "brand": "Volkswagen"},
    "6J": {"platform": "PQ25", "model": "Ibiza Mk4 (6J)", "years": "2008–2017", "brand": "SEAT"},
    "5J": {"platform": "PQ25", "model": "Fabia Mk2 / Roomster", "years": "2007–2014", "brand": "Škoda"},
    "NH": {"platform": "PQ25", "model": "Rapid / Toledo", "years": "2012–2019", "brand": "Škoda / SEAT"},

    # --- PQ35 / PQ46 Platform ---
    "1K": {"platform": "PQ35", "model": "Golf Mk5 / Jetta", "years": "2004–2009", "brand": "Volkswagen"},
    "5K": {"platform": "PQ35", "model": "Golf Mk6", "years": "2008–2013", "brand": "Volkswagen"},
    "AJ": {"platform": "PQ35", "model": "Golf Mk6 Estate / Variant", "years": "2009–2013", "brand": "Volkswagen"},
    "2K": {"platform": "PQ35", "model": "Caddy Mk3 (2K)", "years": "2004–2015", "brand": "Volkswagen"},
    "2C": {"platform": "PQ35", "model": "Caddy Mk4", "years": "2015–2020", "brand": "Volkswagen"},
    "1T": {"platform": "PQ35", "model": "Touran Mk1", "years": "2003–2015", "brand": "Volkswagen"},
    "5N": {"platform": "PQ35", "model": "Tiguan Mk1", "years": "2007–2016", "brand": "Volkswagen"},
    "13": {"platform": "PQ35", "model": "Scirocco Mk3", "years": "2008–2017", "brand": "Volkswagen"},
    "8P": {"platform": "PQ35", "model": "A3 Mk2 (8P)", "years": "2003–2013", "brand": "Audi"},
    "1P": {"platform": "PQ35", "model": "Leon Mk2 (1P)", "years": "2005–2012", "brand": "SEAT"},
    "5P": {"platform": "PQ35", "model": "Altea / Toledo", "years": "2004–2015", "brand": "SEAT"},
    "1Z": {"platform": "PQ35", "model": "Octavia Mk2 (1Z)", "years": "2004–2013", "brand": "Škoda"},
    "5L": {"platform": "PQ35", "model": "Yeti (5L)", "years": "2009–2017", "brand": "Škoda"},
    "3C": {"platform": "PQ35", "model": "Passat B6 / B7 (PQ46)", "years": "2005–2014", "brand": "Volkswagen"},
    "36": {"platform": "PQ35", "model": "Passat B7 (36)", "years": "2010–2014", "brand": "Volkswagen"},
    "CC": {"platform": "PQ35", "model": "Passat CC / CC", "years": "2008–2016", "brand": "Volkswagen"},

    # --- MQB Platform (Modularer Querbaukasten - non-SFD) ---
    "5G": {"platform": "MQB", "model": "Golf Mk7 (5G)", "years": "2012–2020", "brand": "Volkswagen"},
    "BA": {"platform": "MQB", "model": "Golf Mk7 Estate / Variant", "years": "2013–2020", "brand": "Volkswagen"},
    "AU": {"platform": "MQB", "model": "Golf Mk7 Alltrack", "years": "2014–2020", "brand": "Volkswagen"},
    "8V": {"platform": "MQB", "model": "A3 Mk3 (8V)", "years": "2012–2020", "brand": "Audi"},
    "5F": {"platform": "MQB", "model": "Leon Mk3 (5F)", "years": "2012–2020", "brand": "SEAT"},
    "5E": {"platform": "MQB", "model": "Octavia Mk3 (5E)", "years": "2012–2020", "brand": "Škoda"},
    "3G": {"platform": "MQB", "model": "Passat B8 (3G)", "years": "2014–2023", "brand": "Volkswagen"},
    "AD": {"platform": "MQB", "model": "Tiguan Mk2 (AD)", "years": "2016–2023", "brand": "Volkswagen"},
    "BW": {"platform": "MQB", "model": "Tiguan Allspace", "years": "2017–2023", "brand": "Volkswagen"},
    "7L": {"platform": "MQB", "model": "Transporter T6.1 (MQB-lite)", "years": "2019–2024", "brand": "Volkswagen"},
    "NS": {"platform": "MQB", "model": "Kodiaq", "years": "2016–2023", "brand": "Škoda"},
    "KH": {"platform": "MQB", "model": "Ateca", "years": "2016–present", "brand": "SEAT"},
}


def detect_platform_from_vin(vin: str) -> Optional[PlatformInfo]:
    """
    Decodes a standard 17-character VAG VIN and returns the detected platform details.
    Uses ISO 3779 VIN structure:
    Characters 1-3: WMI (Manufacturer)
    Characters 7-8: Vehicle Model / Chassis Code
    """
    if not vin or len(vin.strip()) < 9:
        return None

    clean_vin = vin.strip().upper()
    wmi = clean_vin[:3]
    chassis_code = clean_vin[6:8]  # 0-indexed positions 6 & 7 = 7th and 8th characters

    if chassis_code in CHASSIS_CATALOG:
        entry = CHASSIS_CATALOG[chassis_code]
        brand_name = WMI_MAP.get(wmi, entry["brand"])
        plat_code = entry["platform"]

        platform_names = {
            "PQ25": "PQ25 Platform (Small VAG & Transporter T5.1/T6)",
            "PQ35": "PQ35 / PQ46 Platform (Golf 5/6, Caddy, Passat, A3 8P)",
            "MQB": "MQB Platform (Golf 7, T6.1, Octavia 3, Leon 3, A3 8V)",
        }

        return PlatformInfo(
            code=plat_code,
            name=platform_names.get(plat_code, f"{plat_code} Architecture"),
            chassis_code=chassis_code,
            brand=brand_name,
            model=entry["model"],
            years=entry["years"],
            default_bcm_address=0x09,
            default_bcm_did=0x0600,
            expected_bcm_length=30,
        )

    return None


def get_supported_platforms() -> List[str]:
    """Returns list of supported platform codes."""
    return ["PQ25", "PQ35", "MQB"]
