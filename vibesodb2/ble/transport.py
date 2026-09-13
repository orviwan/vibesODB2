"""
Transport abstraction layer and Bluetooth Low Energy (BLE) Nordic UART Service implementation.
"""

from __future__ import annotations

import abc
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Nordic UART Service (NUS) GATT UUIDs
NUS_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E".lower()
NUS_TX_CHAR_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E".lower()  # Write to dongle
NUS_RX_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E".lower()  # Notify from dongle

TARGET_MTU = 256


class Transport(abc.ABC):
    """Abstract base class for all OBD-II physical and simulated transports."""

    @abc.abstractmethod
    async def connect(self) -> None:
        """Establish transport connection."""
        pass

    @abc.abstractmethod
    async def disconnect(self) -> None:
        """Close transport connection."""
        pass

    @property
    @abc.abstractmethod
    def is_connected(self) -> bool:
        """Check if transport is currently connected."""
        pass

    @abc.abstractmethod
    async def send(self, data: bytes) -> None:
        """Transmit raw bytes to the adapter."""
        pass

    @abc.abstractmethod
    async def receive_until(self, delimiter: bytes = b">", timeout: float = 4.0) -> bytes:
        """Read bytes until the prompt/delimiter character is received or timeout."""
        pass

    async def send_command(self, cmd: str, timeout: float = 4.0) -> str:
        """
        Send an AT/ST or UDS command line ending with '\\r' and wait for prompt '>'.
        Returns stripped text response.
        """
        clean_cmd = cmd.strip()
        payload = (clean_cmd + "\r").encode("ascii")
        logger.debug("TX -> %s", clean_cmd)
        await self.send(payload)
        raw_response = await self.receive_until(delimiter=b">", timeout=timeout)
        text_response = raw_response.decode("ascii", errors="replace").strip()
        if text_response.endswith(">"):
            text_response = text_response[:-1].strip()
        logger.debug("RX <- %s", text_response)
        return text_response


class BleNordicUartTransport(Transport):
    """
    Bluetooth Low Energy transport implementation connecting via Nordic UART Service (NUS).
    Tested with Vgate vLinker MC+, OBDLink MX+, and OBDLink CX adapters.
    """

    def __init__(self, mac_or_uuid: str, timeout: float = 10.0):
        self.mac_or_uuid = mac_or_uuid
        self.timeout = timeout
        self._client = None
        self._rx_queue: asyncio.Queue[bytes] = asyncio.Queue()
        self._rx_buffer = bytearray()
        self._tx_char = None
        self._rx_char = None

    @property
    def is_connected(self) -> bool:
        return self._client is not None and self._client.is_connected

    async def connect(self) -> None:
        from bleak import BleakClient

        logger.info("Connecting to BLE adapter [%s]...", self.mac_or_uuid)
        self._client = BleakClient(self.mac_or_uuid, timeout=self.timeout)
        await self._client.connect()

        # Request larger MTU (256 bytes) to prevent packet fragmentation
        try:
            if hasattr(self._client, "mtu_size"):
                logger.info("Current MTU: %s", self._client.mtu_size)
            if hasattr(self._client, "request_mtu"):
                await self._client.request_mtu(TARGET_MTU)
                logger.info("Negotiated MTU: %s", getattr(self._client, "mtu_size", "unknown"))
        except Exception as e:
            logger.warning("Could not request MTU exchange: %s", e)

        # Discover characteristics
        services = self._client.services
        nus_service = services.get_service(NUS_SERVICE_UUID)
        if not nus_service:
            # Fallback scan through services
            for s in services:
                if s.uuid.lower() == NUS_SERVICE_UUID:
                    nus_service = s
                    break

        if not nus_service:
            raise ConnectionError(
                f"Target Nordic UART Service {NUS_SERVICE_UUID} not found on device {self.mac_or_uuid}."
            )

        self._tx_char = nus_service.get_characteristic(NUS_TX_CHAR_UUID)
        self._rx_char = nus_service.get_characteristic(NUS_RX_CHAR_UUID)

        if not self._tx_char or not self._rx_char:
            raise ConnectionError("Nordic UART TX/RX characteristics missing from device service table.")

        # Start notifications on RX characteristic
        await self._client.start_notify(self._rx_char, self._handle_rx_notification)
        logger.info("Connected to BLE adapter [%s] successfully via NUS.", self.mac_or_uuid)

    def _handle_rx_notification(self, _sender, data: bytearray) -> None:
        """Callback executed when BLE RX characteristic receives bytes."""
        self._rx_queue.put_nowait(bytes(data))

    async def disconnect(self) -> None:
        if self._client and self._client.is_connected:
            try:
                if self._rx_char:
                    await self._client.stop_notify(self._rx_char)
            except Exception as e:
                logger.debug("Error stopping notify: %s", e)
            await self._client.disconnect()
        self._client = None
        self._rx_char = None
        self._tx_char = None
        logger.info("Disconnected from BLE adapter.")

    async def send(self, data: bytes) -> None:
        if not self.is_connected or not self._tx_char:
            raise ConnectionError("BLE Transport is not connected.")

        # Write without response if supported, otherwise write with response
        write_without_resp = "write-without-response" in self._tx_char.properties
        await self._client.write_gatt_char(self._tx_char, data, response=not write_without_resp)

    async def receive_until(self, delimiter: bytes = b">", timeout: float = 4.0) -> bytes:
        """
        Gathers chunks from the RX queue until the delimiter (usually '>') is found
        or the timeout expires.
        """
        end_time = asyncio.get_event_loop().time() + timeout
        while True:
            # Check if delimiter is already in accumulated buffer
            delim_pos = self._rx_buffer.find(delimiter)
            if delim_pos != -1:
                result = bytes(self._rx_buffer[: delim_pos + len(delimiter)])
                del self._rx_buffer[: delim_pos + len(delimiter)]
                return result

            remaining = end_time - asyncio.get_event_loop().time()
            if remaining <= 0:
                # Return whatever was received up to now on timeout
                res = bytes(self._rx_buffer)
                self._rx_buffer.clear()
                if not res:
                    raise TimeoutError(f"Timeout waiting for response (delimiter {delimiter!r}) after {timeout}s.")
                return res

            try:
                chunk = await asyncio.wait_for(self._rx_queue.get(), timeout=remaining)
                self._rx_buffer.extend(chunk)
            except asyncio.TimeoutError:
                res = bytes(self._rx_buffer)
                self._rx_buffer.clear()
                if not res:
                    raise TimeoutError(f"Timeout waiting for response chunk after {timeout}s.")
                return res
