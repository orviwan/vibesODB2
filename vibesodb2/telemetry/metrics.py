"""
Telemetry Metric Definitions and Formulas for Standard OBD-II (Mode 01)
and Manufacturer-Specific VAG UDS (Service 0x22).
"""

from __future__ import annotations

import enum
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional


class FrequencyTier(enum.Enum):
    FAST = "FAST"    # High-frequency polling (20-50 Hz / 50-100 ms)
    SLOW = "SLOW"    # Low-frequency polling (1-2 Hz / 1000-2000 ms)
    UDS = "UDS"      # OEM Enhanced VAG UDS polling (2-5 Hz)


@dataclass
class TelemetryMetric:
    id: str
    name: str
    command: str  # e.g. "010D", "010C", "221154"
    unit: str
    tier: FrequencyTier
    min_val: float
    max_val: float
    warning_val: Optional[float] = None
    danger_val: Optional[float] = None
    decoder: Optional[Callable[[str], Optional[float]]] = None

    def decode(self, raw_hex: str) -> Optional[float]:
        if not self.decoder:
            return None
        return self.decoder(raw_hex)


# --- Decoders for Standard OBD-II Mode 01 PIDs ---

def decode_speed(resp: str) -> Optional[float]:
    """PID 010D: Speed (km/h) = A"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"410D([0-9A-F]{2})", clean)
    if match:
        return float(int(match.group(1), 16))
    return None


def decode_rpm(resp: str) -> Optional[float]:
    """PID 010C: Engine RPM = (256A + B) / 4"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"410C([0-9A-F]{4})", clean)
    if match:
        raw_val = int(match.group(1), 16)
        return round(raw_val / 4.0, 1)
    return None


def decode_coolant_temp(resp: str) -> Optional[float]:
    """PID 0105: Coolant Temperature (°C) = A - 40"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"4105([0-9A-F]{2})", clean)
    if match:
        return float(int(match.group(1), 16) - 40)
    return None


def decode_map_pressure(resp: str) -> Optional[float]:
    """PID 010B: Intake Manifold Absolute Pressure (MAP) in kPa = A"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"410B([0-9A-F]{2})", clean)
    if match:
        return float(int(match.group(1), 16))
    return None


def decode_throttle_pos(resp: str) -> Optional[float]:
    """PID 0111: Throttle Position (%) = (100 * A) / 255"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"4111([0-9A-F]{2})", clean)
    if match:
        return round((int(match.group(1), 16) * 100.0) / 255.0, 1)
    return None


def decode_iat(resp: str) -> Optional[float]:
    """PID 010F: Intake Air Temperature (°C) = A - 40"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"410F([0-9A-F]{2})", clean)
    if match:
        return float(int(match.group(1), 16) - 40)
    return None


def decode_fuel_rail_pressure(resp: str) -> Optional[float]:
    """PID 0123: Fuel Rail Pressure (Diesel) in bar = (10 * (256A + B)) / 100"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"4123([0-9A-F]{4})", clean)
    if match:
        raw_val = int(match.group(1), 16)
        kpa = raw_val * 10.0
        bar = kpa / 100.0
        return round(bar, 1)
    return None


def decode_runtime(resp: str) -> Optional[float]:
    """PID 011F: Engine Run Time Since Start in seconds = 256A + B"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"411F([0-9A-F]{4})", clean)
    if match:
        return float(int(match.group(1), 16))
    return None


# --- Decoders for VAG UDS Service 0x22 Extended Parameters ---

def decode_dpf_soot_mass(resp: str) -> Optional[float]:
    """DID 0x1154: DPF Soot Mass Measured in grams (0.01g per bit)"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"621154([0-9A-F]{4})", clean)
    if match:
        return round(int(match.group(1), 16) * 0.01, 2)
    return None


def decode_egt_turbo(resp: str) -> Optional[float]:
    """DID 0x1155: Exhaust Gas Temperature before Turbo (°C) (0.1°C per bit - 40)"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"621155([0-9A-F]{4})", clean)
    if match:
        return round((int(match.group(1), 16) * 0.1) - 40.0, 1)
    return None


def decode_dsg_gear(resp: str) -> Optional[float]:
    """DID 0x1156: Engaged Gear (1-7, 0=N/P, -1=R)"""
    clean = resp.upper().replace(" ", "").replace("\r", "").replace("\n", "")
    match = re.search(r"621156([0-9A-F]{2})", clean)
    if match:
        val = int(match.group(1), 16)
        return float(val if val <= 7 else 0)
    return None


# Metric Catalog Registry
METRIC_REGISTRY: Dict[str, TelemetryMetric] = {
    # --- FAST TIER (20-50 Hz) ---
    "speed": TelemetryMetric(
        id="speed",
        name="Vehicle Speed",
        command="010D",
        unit="km/h",
        tier=FrequencyTier.FAST,
        min_val=0,
        max_val=250,
        warning_val=130,
        danger_val=160,
        decoder=decode_speed,
    ),
    "rpm": TelemetryMetric(
        id="rpm",
        name="Engine Speed",
        command="010C",
        unit="RPM",
        tier=FrequencyTier.FAST,
        min_val=0,
        max_val=6000,
        warning_val=4500,
        danger_val=5200,
        decoder=decode_rpm,
    ),
    "boost": TelemetryMetric(
        id="boost",
        name="Turbo Boost Pressure",
        command="010B",
        unit="bar",
        tier=FrequencyTier.FAST,
        min_val=0.0,
        max_val=2.5,
        warning_val=1.8,
        danger_val=2.2,
        decoder=lambda r: round(max(0.0, ((decode_map_pressure(r) or 100.0) - 101.3) / 100.0), 2)
        if decode_map_pressure(r) is not None
        else None,
    ),
    "throttle": TelemetryMetric(
        id="throttle",
        name="Throttle Position",
        command="0111",
        unit="%",
        tier=FrequencyTier.FAST,
        min_val=0,
        max_val=100,
        decoder=decode_throttle_pos,
    ),

    # --- SLOW TIER (1-2 Hz) ---
    "coolant_temp": TelemetryMetric(
        id="coolant_temp",
        name="Coolant Temperature",
        command="0105",
        unit="°C",
        tier=FrequencyTier.SLOW,
        min_val=-40,
        max_val=130,
        warning_val=100,
        danger_val=115,
        decoder=decode_coolant_temp,
    ),
    "iat": TelemetryMetric(
        id="iat",
        name="Intake Air Temp",
        command="010F",
        unit="°C",
        tier=FrequencyTier.SLOW,
        min_val=-40,
        max_val=90,
        warning_val=65,
        danger_val=75,
        decoder=decode_iat,
    ),
    "fuel_rail_pressure": TelemetryMetric(
        id="fuel_rail_pressure",
        name="Common Rail Fuel Pressure",
        command="0123",
        unit="bar",
        tier=FrequencyTier.SLOW,
        min_val=0,
        max_val=2000,
        decoder=decode_fuel_rail_pressure,
    ),
    "runtime": TelemetryMetric(
        id="runtime",
        name="Engine Run Time",
        command="011F",
        unit="s",
        tier=FrequencyTier.SLOW,
        min_val=0,
        max_val=86400,
        decoder=decode_runtime,
    ),

    # --- OEM VAG UDS TIER ---
    "dpf_soot": TelemetryMetric(
        id="dpf_soot",
        name="DPF Soot Mass",
        command="221154",
        unit="g",
        tier=FrequencyTier.UDS,
        min_val=0,
        max_val=60,
        warning_val=24.0,
        danger_val=40.0,
        decoder=decode_dpf_soot_mass,
    ),
    "egt_turbo": TelemetryMetric(
        id="egt_turbo",
        name="Exhaust Gas Temp (EGT)",
        command="221155",
        unit="°C",
        tier=FrequencyTier.UDS,
        min_val=0,
        max_val=950,
        warning_val=750,
        danger_val=850,
        decoder=decode_egt_turbo,
    ),
    "gear": TelemetryMetric(
        id="gear",
        name="Engaged Gear",
        command="221156",
        unit="",
        tier=FrequencyTier.UDS,
        min_val=0,
        max_val=7,
        decoder=decode_dsg_gear,
    ),
}
