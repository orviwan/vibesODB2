"""
UDS ISO 14229 Client Implementation for VAG Platforms (PQ25 / PQ35 / MQB).
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
        Returns list of parsed DTC dicts with formatted SAE/VAG code, failure type, and reference info.
        """
        cmd = f"{SID_READ_DTC_INFORMATION:02X}02{status_mask:02X}"
        logger.info("Querying DTCs via Service 0x19...")
        resp = await self.adapter.send_uds_hex(cmd)

        self._check_negative_response(SID_READ_DTC_INFORMATION, resp)

        dtcs: List[dict] = []
        expected_prefix = f"{(SID_READ_DTC_INFORMATION + POS_RESP_OFFSET):02X}02"
        if not resp.startswith(expected_prefix):
            return dtcs

        mod_addr = getattr(getattr(self.adapter, "current_module", None), "address", None)

        # Skip header: "59 02 <DTCStatusAvailabilityMask>" -> 6 hex chars
        data_hex = resp[6:]
        odx_name: Optional[str] = None
        if len(data_hex) >= 8:
            try:
                odx_bytes = await self.read_data_by_id(0xF19E)
                odx_name = odx_bytes.decode("ascii", errors="ignore").strip("\x00 ") or None
            except Exception:
                odx_name = None

        # Each DTC record is 4 bytes (8 hex chars): 3 bytes DTC code + 1 byte status
        for i in range(0, len(data_hex) - 7, 8):
            chunk = data_hex[i : i + 8]
            dtc_code = chunk[:6]
            b0 = int(chunk[0:2], 16)
            b1 = int(chunk[2:4], 16)
            b2 = int(chunk[4:6], 16)
            dtc_status = int(chunk[6:8], 16)
            if b0 == 0 and b1 == 0 and b2 == 0:
                continue
            if b0 == b1 == b2 == dtc_status and b0 in (0xAA, 0x55, 0xFF):
                continue
            decoded = decode_uds_dtc_bytes(b0, b1, b2, module_addr=mod_addr, odx_name=odx_name)
            dtcs.append({
                "code": dtc_code,
                "formatted_code": decoded["formatted_code"],
                "base_code": decoded["base_code"],
                "vag_code": decoded.get("vag_code"),
                "failure_type": decoded["failure_type"],
                "title": decoded["title"],
                "meaning": decoded["meaning"],
                "is_known": decoded["is_known"],
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


_UDS_FTB_LABELS = {
    0x00: "",
    0x01: "General Electrical Failure",
    0x02: "General Signal Failure",
    0x04: "System Internal Failure",
    0x07: "Mechanical Failure",
    0x08: "Bus Signal / Message Failure",
    0x09: "Component Failure",
    0x11: "Circuit Short to Ground",
    0x12: "Circuit Short to Battery (+)",
    0x13: "Circuit Open",
    0x14: "Circuit Short to Ground or Open",
    0x15: "Circuit Short to Battery or Open",
    0x16: "Circuit Voltage Below Threshold",
    0x17: "Circuit Voltage Above Threshold",
    0x18: "Circuit Current Below Threshold",
    0x19: "Circuit Current Above Threshold",
    0x1A: "Circuit Resistance Below Threshold",
    0x1B: "Circuit Resistance Above Threshold",
    0x1C: "Circuit Voltage Out of Range",
    0x1F: "Circuit Intermittent",
    0x23: "Signal Stuck Low",
    0x24: "Signal Stuck High",
    0x29: "Signal Invalid",
    0x2F: "Signal Erratic",
    0x31: "No Signal",
    0x49: "Internal Electronic Failure",
    0x54: "Missing Calibration / Basic Setting",
    0x62: "Signal Compare Failure",
    0x64: "Signal Plausibility Failure",
    0x71: "Actuator Stuck",
    0x72: "Actuator Stuck Open",
    0x73: "Actuator Stuck Closed",
    0x81: "Invalid Serial Data Received",
    0x86: "Signal Invalid on Bus",
    0x87: "Missing Message",
    0x96: "Component Internal Failure",
}

_VAG_SYMPTOMS = {
    1: "Upper Limit Exceeded",
    2: "Lower Limit Exceeded",
    3: "Mechanical Failure",
    4: "No Signal / Communication",
    5: "Basic Setting Not Performed",
    6: "Short Circuit to Plus (+)",
    7: "Short Circuit to Ground (-)",
    8: "Implausible Signal",
    9: "Open Circuit or Short to Plus",
    10: "Open Circuit or Short to Ground",
    11: "Open Circuit",
    12: "Electrical Fault in Circuit",
    14: "Defective / Internal Fault",
    32: "Resistance Too High",
    33: "Resistance Too Low",
}

_DTC_JSON_CACHE: Optional[dict] = None
_UDS_EVENTS_CACHE: Optional[dict] = None


def _get_dtc_dictionary() -> tuple[dict, dict]:
    global _DTC_JSON_CACHE, _UDS_EVENTS_CACHE
    if _DTC_JSON_CACHE is not None and _UDS_EVENTS_CACHE is not None:
        return _DTC_JSON_CACHE, _UDS_EVENTS_CACHE
    import json
    from pathlib import Path

    json_path = Path(__file__).resolve().parents[2] / "pwa" / "data" / "dtcs.json"
    if json_path.exists():
        try:
            raw = json.loads(json_path.read_text(encoding="utf-8"))
            _DTC_JSON_CACHE = raw.get("codes", {})
            _UDS_EVENTS_CACHE = {
                str(k).strip().upper(): str(v).strip().upper()
                for k, v in raw.get("uds_events", {}).items()
            }
            return _DTC_JSON_CACHE, _UDS_EVENTS_CACHE
        except Exception:
            pass
    _DTC_JSON_CACHE = {}
    _UDS_EVENTS_CACHE = {}
    return _DTC_JSON_CACHE, _UDS_EVENTS_CACHE


def decode_sae_j2012(b0: int, b1: int) -> str:
    """Decode two ISO 15031-6 / SAE J2012 bytes into a 5-char code (e.g. 0x90, 0x4A -> 'B104A')."""
    family = ("P", "C", "B", "U")[(b0 >> 6) & 0x03]
    d1 = (b0 >> 4) & 0x03
    d2 = b0 & 0x0F
    d3 = (b1 >> 4) & 0x0F
    d4 = b1 & 0x0F
    return f"{family}{d1}{d2:X}{d3:X}{d4:X}"


def encode_sae_dtc_hex(code_str: str, ftb_override: Optional[int] = None) -> str:
    """Encode an SAE J2012 code string (e.g. 'B104A15' or 'P0299') into 6 UDS hex characters."""
    import re

    cleaned = code_str.strip().upper().replace("-", "").replace(" ", "")
    m = re.match(r"^([PCBU])([0-3])([0-9A-F])([0-9A-F]{2})([0-9A-F]{2})?$", cleaned)
    if not m:
        raise ValueError(f"Invalid SAE J2012 DTC string: {code_str!r}")
    family_idx = {"P": 0, "C": 1, "B": 2, "U": 3}[m.group(1)]
    d1 = int(m.group(2), 10)
    d2 = int(m.group(3), 16)
    b0 = (family_idx << 6) | (d1 << 4) | d2
    b1 = int(m.group(4), 16)
    b2 = (ftb_override & 0xFF) if ftb_override is not None else (int(m.group(5), 16) if m.group(5) else 0x00)
    return f"{b0:02X}{b1:02X}{b2:02X}"


def decode_uds_dtc_bytes(
    b0: int,
    b1: int,
    b2: int,
    module_addr: Optional[int] = None,
    odx_name: Optional[str] = None,
) -> dict:
    """Decode a 3-byte UDS DTC record with module/ODX context and reference dictionary lookup."""
    db, uds_events = _get_dtc_dictionary()
    is_powertrain = module_addr in (None, 0x01, 0x02)
    is_vag_odx = bool(odx_name and odx_name.strip().upper().startswith("EV_"))
    sae_base = decode_sae_j2012(b0, b1)
    dec16 = (b0 << 8) | b1
    vag5 = f"{dec16:05d}"
    dec24 = (b0 << 16) | (b1 << 8) | b2
    mod_hex = f"0X{module_addr:02X}" if module_addr is not None else None

    mapped_sae = (uds_events.get(f"{mod_hex}:{dec24}") if mod_hex else None) or uds_events.get(f"*:{dec24}")
    is_vag24 = (
        is_vag_odx
        or (module_addr == 0x02 and b0 < 0x07)
        or (b0 == 0x00 and b2 != 0x00 and b2 not in _UDS_FTB_LABELS)
        or bool(mapped_sae and b0 == 0x00)
    )

    if is_vag24:
        vag_str = str(dec24)
        if mapped_sae:
            rec = db.get(mapped_sae)
            return {
                "formatted_code": mapped_sae,
                "base_code": mapped_sae,
                "vag_code": vag_str,
                "failure_type": "",
                "title": rec["title"] if rec else f"VAG UDS Fault ({mapped_sae})",
                "meaning": rec["meaning"] if rec else "",
                "is_known": rec is not None,
            }
        return {
            "formatted_code": f"VAG {vag_str}",
            "base_code": vag_str,
            "vag_code": vag_str,
            "failure_type": "",
            "title": f"Unlisted VAG UDS Fault Event ({vag_str})",
            "meaning": "",
            "is_known": False,
        }

    use_vag5 = False
    if b0 < 0x40 and not is_powertrain and (vag5 in db or b0 < 0x10):
        use_vag5 = True

    if use_vag5:
        base_code = vag5
        formatted = vag5
        ft_label = _VAG_SYMPTOMS.get(b2, _UDS_FTB_LABELS.get(b2, f"0x{b2:02X}" if b2 else ""))
    else:
        base_code = sae_base
        formatted = f"{sae_base}-{b2:02X}" if b2 != 0 else sae_base
        ft_label = _UDS_FTB_LABELS.get(b2, f"FTB 0x{b2:02X}" if b2 else "")

    rec = db.get(base_code)
    return {
        "formatted_code": formatted,
        "base_code": base_code,
        "vag_code": vag5 if use_vag5 else (rec.get("vagCode") if rec else None),
        "failure_type": ft_label,
        "title": rec["title"] if rec else "Unlisted Fault Code",
        "meaning": rec["meaning"] if rec else "",
        "is_known": rec is not None,
    }


