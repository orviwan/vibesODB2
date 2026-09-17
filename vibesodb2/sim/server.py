"""
Standalone TCP and WebSocket Vehicle Simulation Server.
Allows external clients, diagnostic programs, and automated tests to connect
to a virtual VAG vehicle over a standard network socket.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from vibesodb2.sim.adapter import SimulatedELM327
from vibesodb2.sim.vehicle import SimulatedVehicle

logger = logging.getLogger(__name__)


class VehicleSimulationServer:
    """
    Asynchronous TCP/Socket server emulating an ELM327 WiFi or BLE-to-TCP bridge.
    """

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 35000,
        profile_id: str = "transporter_t51",
        engine_rpm: int = 0,
        drive_cycle_mode: str = "city",
    ):
        self.host = host
        self.port = port
        self.vehicle = SimulatedVehicle(
            profile_id=profile_id,
            engine_running=(engine_rpm > 0),
            engine_rpm=engine_rpm,
            drive_cycle_mode=drive_cycle_mode,
        )
        self.server: Optional[asyncio.Server] = None
        self._running = False

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        adapter = SimulatedELM327(self.vehicle)
        peer = writer.get_extra_info("peername")
        logger.info(f"Simulator client connected from {peer}")

        # Send initial prompt
        writer.write(b">\r\n")
        await writer.drain()

        buffer = bytearray()
        try:
            while self._running:
                data = await reader.read(256)
                if not data:
                    break

                buffer.extend(data)
                while b"\r" in buffer or b"\n" in buffer:
                    # Find first delimiter
                    idx_r = buffer.find(b"\r")
                    idx_n = buffer.find(b"\n")
                    if idx_r != -1 and idx_n != -1:
                        split_idx = min(idx_r, idx_n)
                    elif idx_r != -1:
                        split_idx = idx_r
                    else:
                        split_idx = idx_n

                    line = bytes(buffer[:split_idx]).decode("ascii", errors="replace").strip()
                    del buffer[: split_idx + 1]

                    if line:
                        resp = adapter.process_command(line)
                        out = (resp + "\r\n>").encode("ascii")
                        writer.write(out)
                        await writer.drain()

        except (ConnectionResetError, asyncio.CancelledError):
            pass
        finally:
            logger.info(f"Simulator client {peer} disconnected")
            writer.close()
            await writer.wait_closed()

    async def start(self):
        self._running = True
        self.server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logger.info(f"Vehicle Simulation Server listening on {self.host}:{self.port}")

    async def stop(self):
        self._running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("Vehicle Simulation Server stopped")


async def run_server(
    host: str = "127.0.0.1",
    port: int = 35000,
    profile_id: str = "transporter_t51",
    engine_rpm: int = 0,
    drive_cycle_mode: str = "city",
):
    server = VehicleSimulationServer(
        host=host,
        port=port,
        profile_id=profile_id,
        engine_rpm=engine_rpm,
        drive_cycle_mode=drive_cycle_mode,
    )
    await server.start()
    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        await server.stop()
