"""
Transport abstraction layer and Bluetooth Low Energy (BLE) Nordic UART Service implementation.
"""

from __future__ import annotations

import abc
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Known BLE OBD-II GATT Services
NUS_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E".lower()
NUS_TX_CHAR_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E".lower()  # Write to dongle
NUS_RX_CHAR_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E".lower()  # Notify from dongle

FFF0_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb".lower()
FFF1_CHAR_UUID = "0000fff1-0000-1000-8000-00805f9b34fb".lower()
FFF2_CHAR_UUID = "0000fff2-0000-1000-8000-00805f9b34fb".lower()

SERVICE_18F0_UUID = "000018f0-0000-1000-8000-00805f9b34fb".lower()
CHAR_2AF0_UUID = "00002af0-0000-1000-8000-00805f9b34fb".lower()
CHAR_2AF1_UUID = "00002af1-0000-1000-8000-00805f9b34fb".lower()

FFE0_SERVICE_UUID = "0000ffe0-0000-1000-8000-00805f9b34fb".lower()
FFE1_CHAR_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb".lower()

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

        if not self.mac_or_uuid or self.mac_or_uuid.lower() == "auto":
            from vibesodb2.ble.discovery import scan_for_adapters
            logger.info("No MAC address specified, scanning for BLE OBD-II adapters...")
            adapters = await scan_for_adapters(timeout=4.0)
            if not adapters:
                raise ConnectionError("No compatible BLE OBD-II adapter discovered nearby.")
            self.mac_or_uuid = adapters[0].address
            logger.info("Auto-selected adapter: %s (%s)", adapters[0].name, self.mac_or_uuid)

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

        # Discover characteristics with robust fallback ladder
        services = self._client.services
        self._tx_char = None
        self._rx_char = None

        # 1. Try Nordic UART Service (NUS)
        nus_service = next((s for s in services if s.uuid.lower() == NUS_SERVICE_UUID), None)
        if nus_service:
            self._tx_char = next((c for c in nus_service.characteristics if c.uuid.lower() == NUS_TX_CHAR_UUID), None)
            self._rx_char = next((c for c in nus_service.characteristics if c.uuid.lower() == NUS_RX_CHAR_UUID), None)

        # 2. Try Vgate / OBDLink 18F0 service
        if not (self._tx_char and self._rx_char):
            service_18f0 = next((s for s in services if s.uuid.lower() == SERVICE_18F0_UUID), None)
            if service_18f0:
                c1 = next((c for c in service_18f0.characteristics if c.uuid.lower() == CHAR_2AF0_UUID), None)
                c2 = next((c for c in service_18f0.characteristics if c.uuid.lower() == CHAR_2AF1_UUID), None)
                if c1 and c2:
                    if "write" in c1.properties or "write-without-response" in c1.properties:
                        self._tx_char, self._rx_char = c1, c2
                    else:
                        self._tx_char, self._rx_char = c2, c1
                else:
                    w = next((c for c in service_18f0.characteristics if "write" in c.properties or "write-without-response" in c.properties), None)
                    r = next((c for c in service_18f0.characteristics if "notify" in c.properties or "indicate" in c.properties), None)
                    if w and r:
                        self._tx_char, self._rx_char = w, r

        # 3. Try FFF0 custom OBD service (requires both fff1 and fff2)
        if not (self._tx_char and self._rx_char):
            fff0_service = next((s for s in services if s.uuid.lower() == FFF0_SERVICE_UUID), None)
            if fff0_service:
                c1 = next((c for c in fff0_service.characteristics if c.uuid.lower() == FFF1_CHAR_UUID), None)
                c2 = next((c for c in fff0_service.characteristics if c.uuid.lower() == FFF2_CHAR_UUID), None)
                if c1 and c2:
                    if "write" in c2.properties or "write-without-response" in c2.properties:
                        self._tx_char, self._rx_char = c2, c1
                    else:
                        self._tx_char, self._rx_char = c1, c2

        # 4. Try FFE0 (HM-10 / CC2540 serial)
        if not (self._tx_char and self._rx_char):
            ffe0_service = next((s for s in services if s.uuid.lower() == FFE0_SERVICE_UUID), None)
            if ffe0_service:
                c = next((ch for ch in ffe0_service.characteristics if ch.uuid.lower() == FFE1_CHAR_UUID), None)
                if c:
                    self._tx_char = c
                    self._rx_char = c

        # 5. Try ISSC Transparent UART
        if not (self._tx_char and self._rx_char):
            issc_service = next((s for s in services if "49535343" in s.uuid.lower()), None)
            if issc_service:
                w = next((c for c in issc_service.characteristics if "write" in c.properties or "write-without-response" in c.properties), None)
                r = next((c for c in issc_service.characteristics if "notify" in c.properties or "indicate" in c.properties), None)
                if w and r:
                    self._tx_char, self._rx_char = w, r

        if not self._tx_char or not self._rx_char:
            raise ConnectionError(
                f"Device '{self.mac_or_uuid}' does not expose a supported OBD-II serial GATT service. "
                "Please verify vehicle ignition is ON and you selected your OBD adapter (e.g. vLinker MC+, OBDLink)."
            )

        # Start notifications on RX characteristic
        await self._client.start_notify(self._rx_char, self._handle_rx_notification)
        logger.info("Connected to BLE adapter [%s] successfully.", self.mac_or_uuid)

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
