"""
Stateful VAG Vehicle Simulator.
Models electronic control units (ECUs), live sensor telemetry,
diagnostic trouble codes (DTCs), and long coding configurations across VAG platforms.
"""

from __future__ import annotations

import copy
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class SimulatedDTC:
    code: str              # e.g. "01117" or "B104A15" or "P0299"
    status_mask: int = 0x2F # Confirmed + Pending + TestFailedSinceLastClear
    failure_type_byte: Optional[int] = None
    symptom: Optional[str] = None
    description: str = ""
    is_vag_decimal: bool = False


@dataclass
class SimulatedECU:
    address: int
    name: str
    part_number: str
    sw_version: str
    hw_version: str = "H01"
    coding: bytearray = field(default_factory=bytearray)
    dtcs: List[SimulatedDTC] = field(default_factory=list)
    dids: Dict[int, bytes] = field(default_factory=dict)
    active_session: int = 0x01
    security_unlocked: bool = False


@dataclass
class VehicleProfile:
    id: str
    name: str
    vin: str
    platform: str
    protocol: str  # "UDS" or "KWP2000"
    engine_type: str = "diesel_tdi"
    engine_displacement: float = 2.0
    modules: Dict[int, SimulatedECU] = field(default_factory=dict)


def create_transporter_t5_profile() -> VehicleProfile:
    """
    2007 VW Transporter T5 (7H Pre-Facelift), 2.5 TDI PD (AXE/BPC engine).
    Uses KWP2000 over TP2.0. Populated with realistic DTCs from standard workshop scans:
    - 01117 (Generator DF Load Signal)
    - 01598 (Drive Battery Voltage Lower Limit)
    - 00588 (Driver Airbag Igniter N95)
    """
    bcm_coding = bytearray(bytes.fromhex("0000000000000000"))
    cluster_coding = bytearray(bytes.fromhex("011001"))

    modules = {
        0x01: SimulatedECU(
            address=0x01,
            name="Engine Control Module",
            part_number="070906016DH",
            sw_version="8547",
            hw_version="H02",
            coding=bytearray(bytes.fromhex("000072")),
            dtcs=[],
        ),
        0x03: SimulatedECU(
            address=0x03,
            name="Brake Electronics (ABS/ESP)",
            part_number="7H0907379E",
            sw_version="0002",
            hw_version="H01",
            coding=bytearray(bytes.fromhex("000054")),
            dtcs=[],
        ),
        0x08: SimulatedECU(
            address=0x08,
            name="Climate Control (HVAC)",
            part_number="7H0907040D",
            sw_version="0201",
            coding=bytearray(bytes.fromhex("000020")),
            dtcs=[],
        ),
        0x09: SimulatedECU(
            address=0x09,
            name="Central Electrics (Bordnetz SG)",
            part_number="7H0937049K",
            sw_version="0401",
            coding=bcm_coding,
            dtcs=[
                SimulatedDTC(
                    code="01117",
                    status_mask=0x2F,
                    failure_type_byte=0x08,
                    symptom="008",
                    description="Generator Terminal DF Load Signal - Implausible Signal",
                    is_vag_decimal=True,
                ),
                SimulatedDTC(
                    code="01598",
                    status_mask=0x2F,
                    failure_type_byte=0x02,
                    symptom="002",
                    description="Drive Battery Voltage - Lower Limit Exceeded",
                    is_vag_decimal=True,
                ),
            ],
            dids={0x0600: bytes(bcm_coding)},
        ),
        0x15: SimulatedECU(
            address=0x15,
            name="Airbag Control Unit",
            part_number="6Q0909605AH",
            sw_version="0004",
            dtcs=[
                SimulatedDTC(
                    code="00588",
                    status_mask=0x2F,
                    failure_type_byte=0x01,
                    symptom="001",
                    description="Airbag Igniter; Driver Side (N95) - Resistance Too Low (33-00)",
                    is_vag_decimal=True,
                )
            ],
        ),
        0x17: SimulatedECU(
            address=0x17,
            name="Instrument Cluster",
            part_number="7H0920871A",
            sw_version="0102",
            coding=cluster_coding,
            dtcs=[],
            dids={0x0600: bytes(cluster_coding)},
        ),
        0x19: SimulatedECU(
            address=0x19,
            name="CAN Gateway",
            part_number="6N0909901",
            sw_version="0001",
            coding=bytearray(bytes.fromhex("000006")),
            dtcs=[],
        ),
    }

    return VehicleProfile(
        id="transporter_t5",
        name="VW Transporter T5 (2007 2.5 TDI)",
        vin="WV1ZZZ7HZ7H000001",
        platform="PQ35",
        protocol="KWP2000",
        engine_type="diesel_tdi",
        engine_displacement=2.5,
        modules=modules,
    )


def create_transporter_t51_profile() -> VehicleProfile:
    """
    2012 VW Transporter T5.1 (7E/7F Facelift), 2.0 TDI CR (CAAB/CCHA engine).
    Uses ISO 14229 UDS over ISO 15765-2.
    Contains realistic 30-byte BCM long coding with configurable lighting/convenience.
    """
    # 30-byte factory coding
    bcm_coding = bytearray(
        bytes.fromhex("B028403C0824240031140000282B0C400000410F60060000200000000000")
    )
    cluster_coding = bytearray(bytes.fromhex("110F01"))

    modules = {
        0x01: SimulatedECU(
            address=0x01,
            name="Engine Control Module",
            part_number="03L906022JD",
            sw_version="9970",
            hw_version="H03",
            coding=bytearray(bytes.fromhex("0111401A232400080000")),
            dtcs=[],
        ),
        0x03: SimulatedECU(
            address=0x03,
            name="Brake Electronics (ABS/ESP)",
            part_number="7E0614517A",
            sw_version="0105",
            coding=bytearray(bytes.fromhex("1071241289A508762478")),
            dtcs=[],
        ),
        0x08: SimulatedECU(
            address=0x08,
            name="Climate Control (HVAC)",
            part_number="7E5907040E",
            sw_version="0402",
            coding=bytearray(bytes.fromhex("0000000002")),
            dtcs=[],
        ),
        0x09: SimulatedECU(
            address=0x09,
            name="Central Electrics (BCM)",
            part_number="7H0937087H",
            sw_version="0304",
            hw_version="H16",
            coding=bcm_coding,
            dtcs=[
                SimulatedDTC(
                    code="B104A15",
                    status_mask=0x2F,
                    failure_type_byte=0x15,
                    description="Rain/Light Recognition Sensor - Open Circuit or Short to Plus",
                ),
                SimulatedDTC(
                    code="00532",
                    status_mask=0x2F,
                    failure_type_byte=0x02,
                    symptom="002",
                    description="Supply Voltage B+ - Lower Limit Exceeded",
                    is_vag_decimal=True,
                ),
            ],
            dids={0x0600: bytes(bcm_coding)},
        ),
        0x10: SimulatedECU(
            address=0x10,
            name="Park Distance Control (PDC)",
            part_number="7E0919283",
            sw_version="0008",
            coding=bytearray(bytes.fromhex("100001")),
            dtcs=[],
        ),
        0x15: SimulatedECU(
            address=0x15,
            name="Airbag Control Unit",
            part_number="7E0959655A",
            sw_version="0012",
            coding=bytearray(bytes.fromhex("0000000000000000")),
            dtcs=[],
        ),
        0x17: SimulatedECU(
            address=0x17,
            name="Instrument Cluster",
            part_number="7E0920870B",
            sw_version="0305",
            coding=cluster_coding,
            dtcs=[],
            dids={0x0600: bytes(cluster_coding)},
        ),
        0x19: SimulatedECU(
            address=0x19,
            name="CAN Gateway",
            part_number="7H0907530H",
            sw_version="0733",
            coding=bytearray(bytes.fromhex("042200")),
            dtcs=[],
        ),
        0x44: SimulatedECU(
            address=0x44,
            name="Power Steering (Servotronic)",
            part_number="7E0909144",
            sw_version="0005",
            coding=bytearray(bytes.fromhex("0001")),
            dtcs=[],
        ),
    }

    return VehicleProfile(
        id="transporter_t51",
        name="VW Transporter T5.1 (2012 2.0 TDI)",
        vin="WV1ZZZ7EZEH012345",
        platform="PQ25",
        protocol="UDS",
        engine_type="diesel_tdi",
        engine_displacement=2.0,
        modules=modules,
    )


def create_golf_mqb_profile() -> VehicleProfile:
    """
    2017 VW Golf Mk7 (MQB Platform), 2.0 TDI EA288.
    Modern UDS architecture with battery regulation and EPB.
    """
    bcm_coding = bytearray(
        bytes.fromhex("00110842C041A2E40B744080410507E41000208100000000000000000000")
    )
    cluster_coding = bytearray(bytes.fromhex("17A40908220000"))

    modules = {
        0x01: SimulatedECU(
            address=0x01,
            name="Engine Control Module",
            part_number="04L906026BK",
            sw_version="2314",
            coding=bytearray(bytes.fromhex("01190012032405082000")),
            dtcs=[],
        ),
        0x02: SimulatedECU(
            address=0x02,
            name="Transmission (DSG DQ250)",
            part_number="0D9300041H",
            sw_version="4512",
            coding=bytearray(bytes.fromhex("0014")),
            dtcs=[],
        ),
        0x03: SimulatedECU(
            address=0x03,
            name="Brakes & EPB",
            part_number="5Q0614517AF",
            sw_version="0410",
            coding=bytearray(bytes.fromhex("1A076AA224240A6F4777060441C52480562490606082943500280024C202")),
            dtcs=[],
        ),
        0x08: SimulatedECU(
            address=0x08,
            name="Air Conditioning",
            part_number="5G0907044BG",
            sw_version="1201",
            coding=bytearray(bytes.fromhex("0002000420010001")),
            dtcs=[],
        ),
        0x09: SimulatedECU(
            address=0x09,
            name="Central Electrics (BCM)",
            part_number="5Q0937084CF",
            sw_version="0236",
            coding=bcm_coding,
            dtcs=[],
            dids={0x0600: bytes(bcm_coding)},
        ),
        0x15: SimulatedECU(
            address=0x15,
            name="Airbag",
            part_number="5Q0959655T",
            sw_version="0039",
            coding=bytearray(bytes.fromhex("983278")),
            dtcs=[],
        ),
        0x17: SimulatedECU(
            address=0x17,
            name="Instrument Cluster",
            part_number="5G1920791A",
            sw_version="1430",
            coding=cluster_coding,
            dtcs=[],
            dids={0x0600: bytes(cluster_coding)},
        ),
        0x19: SimulatedECU(
            address=0x19,
            name="CAN Gateway",
            part_number="3Q0907530C",
            sw_version="4325",
            coding=bytearray(bytes.fromhex("030100042F085900FB0002489C0F00010001050000000000000000000000")),
            dtcs=[],
        ),
    }

    return VehicleProfile(
        id="golf_mqb",
        name="VW Golf Mk7 (2017 2.0 TDI)",
        vin="WVWZZZAUZEW098765",
        platform="MQB",
        protocol="UDS",
        engine_type="diesel_tdi",
        engine_displacement=2.0,
        modules=modules,
    )


PROFILES: Dict[str, VehicleProfile] = {
    "transporter_t5": create_transporter_t5_profile(),
    "transporter_t51": create_transporter_t51_profile(),
    "golf_mqb": create_golf_mqb_profile(),
}


class SimulatedVehicle:
    """
    Complete stateful vehicle simulation including ECUs, diagnostic protocol engines,
    and a dynamic driving cycle physics loop.
    """

    def __init__(
        self,
        profile_id: str = "transporter_t51",
        engine_running: bool = False,
        engine_rpm: int = 0,
        drive_cycle_mode: str = "city",
        simulate_write_nrc: Optional[str] = None,
        simulate_timeout: bool = False,
        simulate_drive_cycle: bool = False,
        initial_battery_voltage: float = 12.6,
    ):
        base_prof = PROFILES.get(profile_id, PROFILES["transporter_t51"])
        self.profile: VehicleProfile = copy.deepcopy(base_prof)
        self.profile_id = profile_id
        self.engine_running = engine_running or (engine_rpm > 0)
        self.manual_rpm = engine_rpm
        self.simulate_write_nrc = simulate_write_nrc
        self.simulate_timeout = simulate_timeout
        self.simulate_drive_cycle = simulate_drive_cycle
        self.battery_voltage = initial_battery_voltage
        self.mileage_km = 142850
        self.dpf_soot_g = 14.82
        self.dpf_ash_g = 42.10
        self.dpf_distance_km = 342
        self.fuel_level_pct = 72.0
        self.fuel_rate_l_h = 0.6 if self.engine_running else 0.0

        from vibesodb2.telemetry.drive_cycle import DriveCycleSimulator
        self.drive_cycle = DriveCycleSimulator(mode=drive_cycle_mode)
        self._start_time = time.time()

    def update_physics(self):
        """Step dynamic telemetry physics."""
        if not self.simulate_drive_cycle:
            if self.engine_running or (self.manual_rpm > 0):
                self.battery_voltage = 14.2
                self.fuel_rate_l_h = 0.6
            else:
                self.battery_voltage = 12.6
                self.fuel_rate_l_h = 0.0
            return None

        sim = self.drive_cycle.update()
        if self.engine_running or (self.manual_rpm > 0):
            self.battery_voltage = 14.2
            self.dpf_soot_g = min(60.0, self.dpf_soot_g + 0.001)
            self.fuel_rate_l_h = max(0.6, (sim.speed * 0.06) + (sim.rpm * 0.0004))
            return sim
        else:
            self.battery_voltage = 12.6
            self.fuel_rate_l_h = 0.0
            return None

    def get_module(self, address: int) -> Optional[SimulatedECU]:
        return self.profile.modules.get(address)

    def inject_dtc(self, module_address: int, dtc: SimulatedDTC):
        mod = self.get_module(module_address)
        if mod:
            # Avoid duplicates
            mod.dtcs = [d for d in mod.dtcs if d.code != dtc.code]
            mod.dtcs.append(dtc)

    def clear_all_dtcs(self):
        for mod in self.profile.modules.values():
            mod.dtcs.clear()

    def clear_module_dtcs(self, module_address: int) -> bool:
        mod = self.get_module(module_address)
        if mod:
            mod.dtcs.clear()
            return True
        return False
