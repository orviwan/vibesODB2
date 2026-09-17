"""
High-fidelity Mock OBD-II Transport simulating a Vgate vLinker MC+ paired with
a VAG ECU network (PQ25 / PQ35 / MQB).
Wraps the vibesodb2.sim vehicle simulation engine for backwards compatibility.
"""

from __future__ import annotations

import logging
from typing import Optional

from vibesodb2.sim.transport import SimulatedTransport

logger = logging.getLogger(__name__)

DEFAULT_T51_BCM_CODING = bytes.fromhex(
    "B028403C0824240031140000282B0C400000410F60060000200000000000"
)
DEFAULT_VIN = "WV1ZZZ7EZEH012345"


class MockTransport(SimulatedTransport):
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
        profile_id: str = "transporter_t51",
    ):
        super().__init__(
            profile_id=profile_id,
            engine_rpm=engine_rpm,
            simulate_write_nrc=simulate_write_nrc,
            simulate_timeout=simulate_timeout,
            simulate_drive_cycle=simulate_drive_cycle,
            drive_cycle_mode=drive_cycle_mode,
        )
        if initial_coding:
            bcm = self.vehicle.get_module(0x09)
            if bcm:
                bcm.coding = bytearray(initial_coding)
        self.engine_rpm = engine_rpm

    @property
    def bcm_coding(self) -> bytearray:
        bcm = self.vehicle.get_module(0x09)
        return bcm.coding if bcm else bytearray()

    @bcm_coding.setter
    def bcm_coding(self, val: bytearray):
        bcm = self.vehicle.get_module(0x09)
        if bcm:
            bcm.coding = bytearray(val)

    @property
    def cluster_coding(self) -> bytearray:
        cl = self.vehicle.get_module(0x17)
        return cl.coding if cl else bytearray()

    @cluster_coding.setter
    def cluster_coding(self, val: bytearray):
        cl = self.vehicle.get_module(0x17)
        if cl:
            cl.coding = bytearray(val)

    @property
    def vin(self) -> str:
        return self.vehicle.profile.vin

    @vin.setter
    def vin(self, val: str):
        self.vehicle.profile.vin = val

    @property
    def dtcs(self) -> list:
        bcm = self.vehicle.get_module(0x09)
        return bcm.dtcs if bcm else []
