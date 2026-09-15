"""
Full End-to-End Integration Test for vibesODB2.
Simulates:
1. BLE/Mock connection
2. Adapter initialization (ATZ, ATE0, ATCAF1, ATSP6)
3. Engine-Off safety interlock (PID 010C)
4. Dynamic CAN arbitration targeting BCM (ATSH 70E, ATCRA 778)
5. Diagnostic session transition (0x10 0x03)
6. Asynchronous TesterPresent keepalive loop (0x3E 0x80)
7. Read Long Coding (0x22 0x06 0x00)
8. Mandatory pre-write SQLite backup snapshot
9. In-memory bitwise manipulation based on decoupled schema
10. Safe write (0x2E 0x06 0x00) with confirmation
11. Rollback test to original snapshot
12. Fault management DTC query & clear
13. Clean return to default session (0x10 0x01)
"""

import tempfile
from pathlib import Path
import pytest

from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.ble.mock_transport import MockTransport
from vibesodb2.safety.bitwise import get_bit, compute_byte_diff
from vibesodb2.safety.guardrails import SafetyEngine
from vibesodb2.safety.storage import StorageManager
from vibesodb2.schema.loader import SchemaLoader
from vibesodb2.uds.client import UDSClient
from vibesodb2.uds.constants import DID_BCM_LONG_CODING, DID_VIN


@pytest.mark.asyncio
async def test_full_vibesodb2_workflow():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "e2e_test.db"
        storage = StorageManager(db_path=db_path)
        safety = SafetyEngine(storage=storage)
        schema_loader = SchemaLoader(storage=storage)

        # 1. Transport & Adapter
        transport = MockTransport(engine_rpm=0)
        await transport.connect()
        assert transport.is_connected is True

        adapter = ELM327Adapter(transport)
        version = await adapter.initialize()
        assert "ELM327" in version

        # 2. Engine-Off Validation
        rpm = await safety.validate_engine_off(adapter)
        assert rpm == 0

        # 3. CAN Arbitration Setup
        cfg = await adapter.set_module_address(0x09)
        assert cfg.tx_header == "70E"
        assert cfg.rx_filter == "778"

        # 4. UDS Client Session
        uds = UDSClient(adapter)
        async with uds:
            # Check VIN
            vin_b = await uds.read_data_by_id(DID_VIN)
            vin = vin_b.decode("ascii", errors="replace").strip()
            assert "WV1ZZZ7E" in vin

            # 5. Read Original BCM Coding
            orig_coding = await uds.read_data_by_id(DID_BCM_LONG_CODING)
            assert len(orig_coding) == 30

            # 6. Apply schema feature modification
            schema = schema_loader.get_schema(module_address=0x09)
            assert schema is not None

            # Initially cornering fogs is OFF
            assert get_bit(orig_coding, 12, 0) is False

            mod_coding = bytearray(orig_coding)
            schema.apply_feature(mod_coding, "cornering_fog_lights", True)
            assert get_bit(mod_coding, 12, 0) is True

            # Verify diff
            diffs = compute_byte_diff(orig_coding, mod_coding)
            assert len(diffs) == 1
            assert diffs[0].byte_index == 12
            assert diffs[0].changed_bits[0].bit_index == 0

            # 7. Safe write execution with SQLite backup
            backup = await safety.execute_safe_write(
                uds_client=uds,
                module_address=0x09,
                did=DID_BCM_LONG_CODING,
                original_bytes=orig_coding,
                modified_bytes=bytes(mod_coding),
                vin=vin,
                skip_engine_check=False,
            )

            assert backup.id == 1
            assert backup.module_address == "0x09"
            assert backup.did == "0x0600"
            assert backup.raw_hex_data == orig_coding.hex().upper()

            # Verify ECU updated
            assert transport.bcm_coding[12] == mod_coding[12]

            # 8. Rollback restore to original configuration
            restored_backup = await safety.execute_safe_write(
                uds_client=uds,
                module_address=0x09,
                did=DID_BCM_LONG_CODING,
                original_bytes=bytes(mod_coding),
                modified_bytes=orig_coding,
                vin=vin,
                skip_engine_check=False,
            )
            assert restored_backup.id == 2
            assert transport.bcm_coding[12] == orig_coding[12]
            assert get_bit(transport.bcm_coding, 12, 0) is False

            # 9. DTC Diagnostics
            dtcs = await uds.read_dtcs()
            assert len(dtcs) > 0
            cleared = await uds.clear_dtcs()
            assert cleared is True
            dtcs_after = await uds.read_dtcs()
            assert len(dtcs_after) == 0

        # Session reset verification
        assert uds.active_session == 0x01
        assert uds._tester_present_active is False

        await transport.disconnect()
        assert transport.is_connected is False
