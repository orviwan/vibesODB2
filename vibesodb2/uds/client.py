"""
UDS ISO 14229 Client Implementation for VW Transporter (PQ25 / PQ35).
Handles Diagnostic Sessions, asynchronous TesterPresent keep-alive,
DID Read/Write, and DTC diagnostics.
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, Optional, Tuple

from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.uds.constants import (
    SID_DIAGNOSTIC_SESSION_CONTROL,
    SID_CLEAR_DIAGNOSTIC_INFORMATION,
    SID_READ_DTC_INFORMATION,
    SID_READ_DATA_BY_IDENTIFIER,
    SID_WRITE_DATA_BY_IDENTIFIER,
    SID_TESTER_PRESENT,
    SID_NEGATIVE_RESPONSE,
    POS_RESP_OFFSET,
    SESSION_EXTENDED,
    SESSION_DEFAULT,
)
from vibesodb2.uds.exceptions import (
    UDSError,
    NegativeResponseError,
    SessionError,
    DIDMismatchError,
)

logger = logging.getLogger(__name__)


class UDSClient:
    """
    Unified Diagnostic Services (ISO 14229) Client.
    """

    def __init__(self, adapter: ELM327Adapter):
        self.adapter = adapter
        self._tester_present_task: Optional[asyncio.Task] = None
        self._tester_present_active: bool = False
        self._active_session: int = SESSION_DEFAULT

    @property
    def active_session(self) -> int:
        return self._active_session

    async def __aenter__(self) -> "UDSClient":
        await self.start_extended_session()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        try:
            await self.reset_to_default_session()
        except Exception as e:
            logger.debug("Error during session reset: %s", e)

    async def start_extended_session(self) -> None:
        """
        Transition controller to Extended Diagnostic Session (0x10 0x03)
        and spawn asynchronous 2000ms TesterPresent worker.
        """
        logger.info("Opening UDS Extended Diagnostic Session (0x10 0x03)...")
        cmd = f"{SID_DIAGNOSTIC_SESSION_CONTROL:02X}{SESSION_EXTENDED:02X}"
        resp = await self.adapter.send_uds_hex(cmd)

        self._check_negative_response(SID_DIAGNOSTIC_SESSION_CONTROL, resp)

        expected_prefix = f"{(SID_DIAGNOSTIC_SESSION_CONTROL + POS_RESP_OFFSET):02X}{SESSION_EXTENDED:02X}"
        if not resp.startswith(expected_prefix):
            raise SessionError(f"Failed to enter extended session. Response: {resp}")

        self._active_session = SESSION_EXTENDED
        logger.info("Extended session granted (0x50 0x03). Starting TesterPresent loop.")
        self.start_tester_present_loop(interval_seconds=2.0)

    def start_tester_present_loop(self, interval_seconds: float = 2.0) -> None:
        """Spawn background task firing 3E 80 every 2000ms."""
        if self._tester_present_task and not self._tester_present_task.done():
            return

        self._tester_present_active = True
        self._tester_present_task = asyncio.create_task(
            self._tester_present_worker(interval_seconds)
        )

    async def _tester_present_worker(self, interval_seconds: float) -> None:
        """Background worker keeping the diagnostic session alive."""
        cmd = f"{SID_TESTER_PRESENT:02X}80"  # 3E 80 = suppress positive response
        logger.debug("TesterPresent loop started (interval: %.1fs).", interval_seconds)
        try:
            while self._tester_present_active:
                await asyncio.sleep(interval_seconds)
                if not self._tester_present_active:
                    break
                try:
                    await self.adapter.send_uds_hex(cmd, timeout=1.5)
                except Exception as e:
                    logger.debug("TesterPresent packet error: %s", e)
        except asyncio.CancelledError:
            pass
        finally:
            logger.debug("TesterPresent loop stopped.")

    def stop_tester_present_loop(self) -> None:
        """Stops the TesterPresent worker."""
        self._tester_present_active = False
        if self._tester_present_task and not self._tester_present_task.done():
            self._tester_present_task.cancel()
        self._tester_present_task = None

    async def reset_to_default_session(self) -> None:
        """
        Stops TesterPresent loop and sends 10 01 to restore standard ECU operation.
        """
        logger.info("Resetting ECU to Default Diagnostic Session (0x10 0x01)...")
        self.stop_tester_present_loop()
        cmd = f"{SID_DIAGNOSTIC_SESSION_CONTROL:02X}{SESSION_DEFAULT:02X}"
        try:
            await self.adapter.send_uds_hex(cmd, timeout=2.0)
        except Exception as e:
            logger.warning("Error resetting to default session: %s", e)
        self._active_session = SESSION_DEFAULT

    async def read_data_by_id(self, did: int) -> bytes:
        """
        Read Data By Identifier (Service 0x22).
        Returns the raw payload bytes without the 62 <DID> response header.
        """
        did_hex = f"{did:04X}"
        cmd = f"{SID_READ_DATA_BY_IDENTIFIER:02X}{did_hex}"
        logger.info("Reading Data Identifier: 0x%s...", did_hex)
        resp = await self.adapter.send_uds_hex(cmd)

        self._check_negative_response(SID_READ_DATA_BY_IDENTIFIER, resp)

        expected_prefix = f"{(SID_READ_DATA_BY_IDENTIFIER + POS_RESP_OFFSET):02X}{did_hex}"
        if not resp.startswith(expected_prefix):
            raise DIDMismatchError(
                f"Expected response starting with {expected_prefix}, got {resp}"
            )

        payload_hex = resp[len(expected_prefix) :]
        payload_bytes = bytes.fromhex(payload_hex)
        logger.info("Read DID 0x%s successful (%d bytes).", did_hex, len(payload_bytes))
        return payload_bytes

    async def write_data_by_id(self, did: int, payload: bytes) -> None:
        """
        Write Data By Identifier (Service 0x2E).
        Verifies 6E <DID> positive response or raises NegativeResponseError.
        """
        did_hex = f"{did:04X}"
        payload_hex = payload.hex().upper()
        cmd = f"{SID_WRITE_DATA_BY_IDENTIFIER:02X}{did_hex}{payload_hex}"
        logger.info("Writing Data Identifier 0x%s (%d bytes)...", did_hex, len(payload))
        resp = await self.adapter.send_uds_hex(cmd)

        self._check_negative_response(SID_WRITE_DATA_BY_IDENTIFIER, resp)

        expected_prefix = f"{(SID_WRITE_DATA_BY_IDENTIFIER + POS_RESP_OFFSET):02X}{did_hex}"
        if not resp.startswith(expected_prefix):
            raise UDSError(f"Unexpected write response for DID 0x{did_hex}: {resp}")

        logger.info("Write DID 0x%s positive ack received (0x6E).", did_hex)

    async def read_dtcs(self, status_mask: int = 0x09) -> List[dict]:
        """
        Read Diagnostic Trouble Codes via Service 0x19 (Sub-function 0x02: ReportDTCByStatusMask).
        Returns list of parsed DTC dicts.
        """
        cmd = f"{SID_READ_DTC_INFORMATION:02X}02{status_mask:02X}"
        logger.info("Querying DTCs via Service 0x19...")
        resp = await self.adapter.send_uds_hex(cmd)

        self._check_negative_response(SID_READ_DTC_INFORMATION, resp)

        dtcs: List[dict] = []
        expected_prefix = f"{(SID_READ_DTC_INFORMATION + POS_RESP_OFFSET):02X}02"
        if not resp.startswith(expected_prefix):
            return dtcs

        # Skip header: "59 02 <DTCStatusAvailabilityMask>" -> 6 hex chars
        data_hex = resp[6:]
        # Each DTC record is 4 bytes (8 hex chars): 3 bytes DTC code + 1 byte status
        for i in range(0, len(data_hex) - 7, 8):
            chunk = data_hex[i : i + 8]
            dtc_code = chunk[:6]
            dtc_status = int(chunk[6:8], 16)
            dtcs.append({
                "code": dtc_code,
                "status_mask": f"0x{dtc_status:02X}",
                "confirmed": bool(dtc_status & 0x08),
                "pending": bool(dtc_status & 0x04),
            })

        logger.info("Retrieved %d DTC(s).", len(dtcs))
        return dtcs

    async def clear_dtcs(self) -> bool:
        """
        Clears all diagnostic trouble codes across the module via Service 0x14 (ClearDiagnosticInformation).
        """
        cmd = f"{SID_CLEAR_DIAGNOSTIC_INFORMATION:02X}FFFFFF"
        logger.info("Clearing DTCs via Service 0x14 (0x14 FF FF FF)...")
        resp = await self.adapter.send_uds_hex(cmd)

        self._check_negative_response(SID_CLEAR_DIAGNOSTIC_INFORMATION, resp)

        expected_prefix = f"{(SID_CLEAR_DIAGNOSTIC_INFORMATION + POS_RESP_OFFSET):02X}"
        return resp.startswith(expected_prefix)

    def _check_negative_response(self, requested_sid: int, resp: str) -> None:
        """Check for UDS Negative Response (0x7F <SID> <NRC>)."""
        clean = resp.upper().replace(" ", "")
        if clean.startswith(f"{SID_NEGATIVE_RESPONSE:02X}"):
            if len(clean) >= 6:
                sid_failed = int(clean[2:4], 16)
                nrc = int(clean[4:6], 16)
                raise NegativeResponseError(service_id=sid_failed, nrc=nrc, raw_response=clean)
            raise UDSError(f"UDS Negative Response: {clean}")
