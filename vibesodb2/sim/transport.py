"""
Simulated in-memory Transport connecting to SimulatedVehicle via SimulatedELM327.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from vibesodb2.ble.transport import Transport
from vibesodb2.sim.adapter import SimulatedELM327
from vibesodb2.sim.vehicle import SimulatedVehicle

logger = logging.getLogger(__name__)


class SimulatedTransport(Transport):
    """
    In-memory simulated OBD-II transport connected to a SimulatedVehicle.
    """

    def __init__(
        self,
        vehicle: Optional[SimulatedVehicle] = None,
        profile_id: str = "transporter_t51",
        engine_rpm: int = 0,
        simulate_write_nrc: Optional[str] = None,
        simulate_timeout: bool = False,
        simulate_drive_cycle: bool = False,
        drive_cycle_mode: str = "city",
    ):
        if vehicle is not None:
            self.vehicle = vehicle
        else:
            self.vehicle = SimulatedVehicle(
                profile_id=profile_id,
                engine_running=(engine_rpm > 0),
                engine_rpm=engine_rpm,
                simulate_write_nrc=simulate_write_nrc,
                simulate_timeout=simulate_timeout,
                simulate_drive_cycle=simulate_drive_cycle,
                drive_cycle_mode=drive_cycle_mode,
            )

        self.adapter = SimulatedELM327(self.vehicle)
        self._connected = False
        self._rx_buffer = bytearray()

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def echo(self) -> bool:
        return self.adapter.echo

    @echo.setter
    def echo(self, val: bool):
        self.adapter.echo = val

    @property
    def spaces(self) -> bool:
        return self.adapter.spaces

    @spaces.setter
    def spaces(self, val: bool):
        self.adapter.spaces = val

    @property
    def linefeeds(self) -> bool:
        return self.adapter.linefeeds

    @linefeeds.setter
    def linefeeds(self, val: bool):
        self.adapter.linefeeds = val

    @property
    def can_formatting(self) -> bool:
        return self.adapter.can_formatting

    @can_formatting.setter
    def can_formatting(self, val: bool):
        self.adapter.can_formatting = val

    @property
    def protocol(self) -> str:
        return self.adapter.protocol

    @protocol.setter
    def protocol(self, val: str):
        self.adapter.protocol = val

    @property
    def tx_header(self) -> str:
        return self.adapter.tx_header

    @tx_header.setter
    def tx_header(self, val: str):
        self.adapter.tx_header = val

    @property
    def rx_filter(self) -> str:
        return self.adapter.rx_filter

    @rx_filter.setter
    def rx_filter(self, val: str):
        self.adapter.rx_filter = val

    @property
    def active_session(self) -> int:
        return self.adapter.active_session

    @active_session.setter
    def active_session(self, val: int):
        self.adapter.active_session = val

    @property
    def engine_rpm(self) -> int:
        return self.vehicle.manual_rpm

    @engine_rpm.setter
    def engine_rpm(self, val: int):
        self.vehicle.manual_rpm = val
        self.vehicle.engine_running = (val > 0)

    async def connect(self) -> None:
        self._connected = True
        logger.debug("SimulatedTransport connected.")

    async def disconnect(self) -> None:
        self._connected = False
        logger.debug("SimulatedTransport disconnected.")

    async def send(self, data: bytes) -> None:
        if not self._connected:
            raise ConnectionError("SimulatedTransport not connected.")

        cmd_str = data.decode("ascii", errors="replace").strip()
        response = self.adapter.process_command(cmd_str)

        if self.vehicle.simulate_timeout:
            # Drop response to trigger timeout
            return

        formatted = (response + "\r\n>").encode("ascii")
        self._rx_buffer.extend(formatted)

    async def receive_until(self, delimiter: bytes = b">", timeout: float = 4.0) -> bytes:
        if not self._connected:
            raise ConnectionError("SimulatedTransport not connected.")

        delim_pos = self._rx_buffer.find(delimiter)
        if delim_pos != -1:
            res = bytes(self._rx_buffer[: delim_pos + len(delimiter)])
            del self._rx_buffer[: delim_pos + len(delimiter)]
            return res

        await asyncio.sleep(0.005)
        delim_pos = self._rx_buffer.find(delimiter)
        if delim_pos != -1:
            res = bytes(self._rx_buffer[: delim_pos + len(delimiter)])
            del self._rx_buffer[: delim_pos + len(delimiter)]
            return res

        raise TimeoutError(f"SimulatedTransport: timeout waiting for {delimiter!r}")
