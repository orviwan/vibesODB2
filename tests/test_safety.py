"""
Unit tests for Safety Guardrail Engine and SQLite Storage.
"""

import tempfile
from pathlib import Path
import pytest

from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.ble.mock_transport import MockTransport
from vibesodb2.safety.guardrails import (
    SafetyEngine,
    BlacklistedModuleError,
    EngineRunningInterlockError,
    PayloadLengthMismatchError,
    BLACKLISTED_MODULES,
)
from vibesodb2.safety.storage import StorageManager
from vibesodb2.uds.client import UDSClient
from vibesodb2.uds.constants import DID_BCM_LONG_CODING
from vibesodb2.uds.exceptions import NegativeResponseError


def test_blacklisted_modules():
    safety = SafetyEngine()

    for addr in [0x03, 0x15, 0x44]:
        assert addr in BLACKLISTED_MODULES
        with pytest.raises(BlacklistedModuleError):
            safety.validate_module_allowed(addr)

    # Allowed modules
    safety.validate_module_allowed(0x09)  # BCM
    safety.validate_module_allowed(0x17)  # Cluster
    safety.validate_module_allowed(0x19)  # Gateway


@pytest.mark.asyncio
async def test_engine_running_interlock():
    safety = SafetyEngine()

    # Engine OFF (0 RPM)
    transport_off = MockTransport(engine_rpm=0)
    await transport_off.connect()
    adapter_off = ELM327Adapter(transport_off)
    await adapter_off.initialize()

    rpm = await safety.validate_engine_off(adapter_off)
    assert rpm == 0
    await transport_off.disconnect()

    # Engine Running (850 RPM)
    transport_running = MockTransport(engine_rpm=850)
    await transport_running.connect()
    adapter_running = ELM327Adapter(transport_running)
    await adapter_running.initialize()

    with pytest.raises(EngineRunningInterlockError):
        await safety.validate_engine_off(adapter_running)

    await transport_running.disconnect()


def test_strict_payload_sizing():
    safety = SafetyEngine()
    orig = bytes([0x00] * 30)

    # Same length -> OK
    safety.validate_payload_length(orig, bytes([0xFF] * 30))

    # Differing length (24 vs 30) -> Error
    with pytest.raises(PayloadLengthMismatchError):
        safety.validate_payload_length(orig, bytes([0xFF] * 24))


def test_sqlite_backup_storage():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_backups.db"
        storage = StorageManager(db_path=db_path)

        # Save backup
        backup_id = storage.save_backup(
            vin="WV1ZZZ7EZEH999999",
            module_address="0x09",
            did="0x0600",
            raw_hex_data="AABBCCDDEEFF",
        )
        assert backup_id == 1

        # Retrieve backup
        backup = storage.get_backup_by_id(backup_id)
        assert backup is not None
        assert backup.vin == "WV1ZZZ7EZEH999999"
        assert backup.module_address == "0x09"
        assert backup.raw_hex_data == "AABBCCDDEEFF"

        # List backups
        all_backups = storage.list_backups(module_address="0x09")
        assert len(all_backups) == 1
        assert all_backups[0].id == 1


def _sent_writes(transport):
    return [c for c in transport.sent_commands if c.upper().startswith("2E")]


@pytest.mark.asyncio
async def test_nrc_is_reported_without_a_rollback_rewrite():
    """A negative response means the ECU changed nothing, so re-writing the baseline is
    pointless and only adds bus traffic to a module that is already refusing writes."""
    with tempfile.TemporaryDirectory() as tmpdir:
        storage = StorageManager(db_path=Path(tmpdir) / "rollback_test.db")
        safety = SafetyEngine(storage=storage)

        transport = MockTransport(simulate_write_nrc="31")
        await transport.connect()
        adapter = ELM327Adapter(transport)
        await adapter.initialize()
        await adapter.set_module_address(0x09)

        uds = UDSClient(adapter)
        async with uds:
            orig_payload = bytes(transport.bcm_coding)
            mod_payload = bytes([0xBB] * len(orig_payload))

            with pytest.raises(NegativeResponseError):
                await safety.execute_safe_write(
                    uds_client=uds,
                    module_address=0x09,
                    did=DID_BCM_LONG_CODING,
                    original_bytes=orig_payload,
                    modified_bytes=mod_payload,
                    vin="WV1ZZZ7EZEH123456",
                    skip_engine_check=True,
                )

            assert len(_sent_writes(transport)) == 1
            backups = storage.list_backups()
            assert len(backups) == 1
            assert backups[0].raw_hex_data == orig_payload.hex().upper()

        await transport.disconnect()


@pytest.mark.asyncio
async def test_successful_write_is_verified_by_reading_back():
    with tempfile.TemporaryDirectory() as tmpdir:
        safety = SafetyEngine(storage=StorageManager(db_path=Path(tmpdir) / "v.db"))
        transport = MockTransport()
        await transport.connect()
        adapter = ELM327Adapter(transport)
        await adapter.initialize()
        await adapter.set_module_address(0x09)
        uds = UDSClient(adapter)
        async with uds:
            orig = bytes(transport.bcm_coding)
            mod = bytearray(orig); mod[0] ^= 0x01
            await safety.execute_safe_write(uds, 0x09, DID_BCM_LONG_CODING, orig, bytes(mod), vin="V", skip_engine_check=True)
            reads = [c for c in transport.sent_commands if c.upper().startswith("220600")]
            assert reads, "the DID must be read back after writing"
            assert transport.bcm_coding == mod
        await transport.disconnect()


@pytest.mark.asyncio
async def test_readback_mismatch_restores_baseline_and_raises():
    from vibesodb2.safety.guardrails import WriteVerificationError

    with tempfile.TemporaryDirectory() as tmpdir:
        safety = SafetyEngine(storage=StorageManager(db_path=Path(tmpdir) / "m.db"))
        transport = MockTransport()
        await transport.connect()
        adapter = ELM327Adapter(transport)
        await adapter.initialize()
        await adapter.set_module_address(0x09)
        uds = UDSClient(adapter)
        async with uds:
            orig = bytes(transport.bcm_coding)
            mod = bytearray(orig); mod[0] ^= 0x01

            real_read = uds.read_data_by_id

            async def corrupted_read(did):
                data = await real_read(did)
                return bytes([data[0] ^ 0x80]) + data[1:]
            uds.read_data_by_id = corrupted_read

            with pytest.raises(WriteVerificationError):
                await safety.execute_safe_write(uds, 0x09, DID_BCM_LONG_CODING, orig, bytes(mod), vin="V", skip_engine_check=True)

            writes = _sent_writes(transport)
            assert len(writes) == 2, "one write plus one baseline restore"
            assert writes[-1].upper().endswith(orig.hex().upper())
        await transport.disconnect()
