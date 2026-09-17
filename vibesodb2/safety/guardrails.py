"""
Safety Guardrail Architecture & Fail-Safe Pipeline.
Enforces module blacklisting, engine-off validation, strict payload sizing,
mandatory pre-write SQLite snapshots, and read-back verification with baseline restore on mismatch.
"""

from __future__ import annotations

import logging
from typing import Optional

from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.safety.storage import StorageManager, CodingBackup
from vibesodb2.uds.client import UDSClient
from vibesodb2.uds.exceptions import NegativeResponseError

logger = logging.getLogger(__name__)

# Hardcoded Safety-Critical Blacklist (Never allow writing to these modules)
BLACKLISTED_MODULES = {
    0x03: "Brakes / ABS / ESP (Electronic Stability Program)",
    0x15: "Airbag Deployment & Occupant Restraint Systems",
    0x44: "Electromechanical Power Steering (EPS)",
}


class SafetyViolationError(Exception):
    """Base exception for all safety guardrail violations."""
    pass


class BlacklistedModuleError(SafetyViolationError):
    """Raised when an attempt is made to access or modify a blacklisted safety module."""
    pass


class EngineRunningInterlockError(SafetyViolationError):
    """Raised when engine RPM is detected above 0 during write pre-flight."""
    pass


class PayloadLengthMismatchError(SafetyViolationError):
    """Raised when write payload length differs from original read length."""
    pass


class WriteVerificationError(SafetyViolationError):
    """Raised when the coding read back after a write does not match what was written."""

    def __init__(self, message: str, restored: bool):
        super().__init__(message)
        self.restored = restored


class SafetyEngine:
    """
    Coordinates pre-flight safety validations and zero-touch snapshots.
    """

    def __init__(self, storage: Optional[StorageManager] = None):
        self.storage = storage or StorageManager()

    def validate_write_allowed(self, module_address: int) -> None:
        """
        Guardrail 1: Critical Module Coding Write Blacklist.
        Rejects long-coding write operations (UDS 0x2E) to safety-critical controllers
        (ABS/ESP 0x03, Airbag 0x15, Power Steering 0x44) to prevent dangerous misconfiguration.
        Note: DTC reading and clearing (0x19 / 0x14) is permitted for maintenance.
        """
        if module_address in BLACKLISTED_MODULES:
            desc = BLACKLISTED_MODULES[module_address]
            msg = (
                f"SAFETY INTERLOCK ACTIVATED: Coding writes to Module 0x{module_address:02X} ({desc}) are blacklisted. "
                "Writing long-coding configuration to safety-critical controllers is strictly forbidden."
            )
            logger.critical(msg)
            raise BlacklistedModuleError(msg)

    def validate_module_allowed(self, module_address: int) -> None:
        """Alias for validate_write_allowed for backwards compatibility."""
        return self.validate_write_allowed(module_address)

    async def validate_engine_off(self, adapter: ELM327Adapter, max_rpm_threshold: int = 50) -> int:
        """
        Guardrail 2: Engine Running Interlock.
        Queries OBD-II PID 010C (Engine RPM). If RPM > threshold, aborts.
        Must be Ignition ON, Engine OFF.
        """
        rpm = await adapter.read_engine_rpm()
        if rpm > max_rpm_threshold:
            msg = (
                f"ENGINE RUNNING INTERLOCK: Vehicle engine is active ({rpm} RPM > {max_rpm_threshold} RPM). "
                "Writing long coding while engine is running or vehicle is in motion is prohibited. "
                "Please switch to Ignition ON, Engine OFF."
            )
            logger.critical(msg)
            raise EngineRunningInterlockError(msg)
        logger.info("Engine-Off safety check passed (Current RPM: %d).", rpm)
        return rpm

    def validate_payload_length(self, original: bytes, modified: bytes) -> None:
        """
        Guardrail 4: Strict Payload Sizing.
        Ensures modified payload strictly matches original baseline byte length.
        """
        if len(original) != len(modified):
            msg = (
                f"PAYLOAD LENGTH MISMATCH: Original configuration length is {len(original)} bytes, "
                f"but modified payload is {len(modified)} bytes. Refusing to transmit invalid payload."
            )
            logger.critical(msg)
            raise PayloadLengthMismatchError(msg)

    def execute_prewrite_backup(
        self,
        vin: str,
        module_address: int | str,
        did: int | str,
        original_payload: bytes,
    ) -> CodingBackup:
        """
        Guardrail 3: Pre-Write Snapshot Table.
        Captures an immutable SQLite record of the original hex string prior to any write.
        """
        mod_str = f"0x{module_address:02X}" if isinstance(module_address, int) else str(module_address)
        did_str = f"0x{did:04X}" if isinstance(did, int) else str(did)
        raw_hex = original_payload.hex().upper()

        backup_id = self.storage.save_backup(
            vin=vin,
            module_address=mod_str,
            did=did_str,
            raw_hex_data=raw_hex,
        )
        backup = self.storage.get_backup_by_id(backup_id)
        if not backup:
            raise RuntimeError("CRITICAL: Failed to verify SQLite backup write to disk.")

        logger.info("Pre-write snapshot #%d saved to SQLite for module %s DID %s.", backup.id, mod_str, did_str)
        return backup

    async def execute_safe_write(
        self,
        uds_client: UDSClient,
        module_address: int,
        did: int,
        original_bytes: bytes,
        modified_bytes: bytes,
        vin: str = "UNKNOWN_VIN",
        skip_engine_check: bool = False,
    ) -> CodingBackup:
        """
        Executes the complete 5-point safety writing pipeline:
        1. Module blacklist check
        2. Engine-off verification
        3. Mandatory SQLite backup snapshot
        4. Strict length consistency check
        5. Write execution with read-back verification (baseline restored once on mismatch)
        """
        # 1. Module blacklist
        self.validate_module_allowed(module_address)

        # 2. Engine-off interlock
        if not skip_engine_check:
            await self.validate_engine_off(uds_client.adapter)

        # 3. Length check
        self.validate_payload_length(original_bytes, modified_bytes)

        # 4. Mandatory snapshot
        backup = self.execute_prewrite_backup(
            vin=vin,
            module_address=module_address,
            did=did,
            original_payload=original_bytes,
        )

        # 5. Write, then verify by reading back. A negative response means the ECU changed
        #    nothing, so it is reported without any rewrite. Only a read-back mismatch triggers a
        #    single restore of the baseline.
        try:
            await uds_client.write_data_by_id(did, modified_bytes)
        except NegativeResponseError as nrc_err:
            logger.critical("UDS write rejected by ECU (%s). No change was made to the vehicle.", nrc_err)
            raise

        read_back = await uds_client.read_data_by_id(did)
        if bytes(read_back) == bytes(modified_bytes):
            logger.info("Safe write verified for module 0x%02X DID 0x%04X.", module_address, did)
            return backup

        logger.critical(
            "Post-write verification mismatch on module 0x%02X DID 0x%04X: ECU reports %s. Restoring baseline...",
            module_address, did, read_back.hex().upper(),
        )
        restored = False
        try:
            await uds_client.write_data_by_id(did, original_bytes)
            restored = True
            logger.info("Baseline restored and acknowledged by the ECU.")
        except Exception as restore_err:
            logger.critical("Baseline restore failed: %s", restore_err)
        raise WriteVerificationError(
            f"Post-write verification failed: ECU reports {read_back.hex().upper()} but {modified_bytes.hex().upper()} was written. "
            + ("The original baseline was re-written and acknowledged." if restored else f"Automatic restore FAILED; use `backups --restore {backup.id}`."),
            restored=restored,
        )
