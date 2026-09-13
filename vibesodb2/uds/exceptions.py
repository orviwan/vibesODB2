"""
UDS Protocol exceptions and Negative Response Code translations.
"""

from typing import Optional
from vibesodb2.uds.constants import NRC_MAP


class UDSError(Exception):
    """Base class for all UDS protocol errors."""
    pass


class NegativeResponseError(UDSError):
    """Raised when the ECU returns a Negative Response Code (NRC 0x7F)."""

    def __init__(self, service_id: int, nrc: int, raw_response: str = ""):
        self.service_id = service_id
        self.nrc = nrc
        self.raw_response = raw_response
        nrc_desc = NRC_MAP.get(nrc, f"Unknown NRC 0x{nrc:02X}")
        super().__init__(
            f"UDS Negative Response (0x7F) for Service 0x{service_id:02X}: NRC 0x{nrc:02X} ({nrc_desc})"
        )


class SessionError(UDSError):
    """Raised when a diagnostic session transition fails."""
    pass


class DIDMismatchError(UDSError):
    """Raised when the DID returned does not match the requested DID."""
    pass
