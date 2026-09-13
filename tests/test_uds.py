"""
Unit tests for UDS ISO 14229 Client.
"""

import pytest
from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.ble.mock_transport import MockTransport
from vibesodb2.uds.client import UDSClient
from vibesodb2.uds.constants import (
    DID_BCM_LONG_CODING,
    SESSION_EXTENDED,
    SESSION_DEFAULT,
)
from vibesodb2.uds.exceptions import NegativeResponseError


@pytest.mark.asyncio
async def test_session_transition_and_tester_present():
    transport = MockTransport()
    await transport.connect()

    adapter = ELM327Adapter(transport)
    await adapter.initialize()

    uds = UDSClient(adapter)
    assert uds.active_session == SESSION_DEFAULT

    await uds.start_extended_session()
    assert uds.active_session == SESSION_EXTENDED
    assert transport.active_session == 0x03
    assert uds._tester_present_active is True

    await uds.reset_to_default_session()
    assert uds.active_session == SESSION_DEFAULT
    assert transport.active_session == 0x01
    assert uds._tester_present_active is False

    await transport.disconnect()


@pytest.mark.asyncio
async def test_read_data_by_id():
    transport = MockTransport()
    await transport.connect()
    adapter = ELM327Adapter(transport)
    await adapter.initialize()
    await adapter.set_module_address(0x09)

    uds = UDSClient(adapter)
    async with uds:
        data = await uds.read_data_by_id(DID_BCM_LONG_CODING)
        assert len(data) == 30
        assert data.hex().upper().startswith("B028403C")

    await transport.disconnect()


@pytest.mark.asyncio
async def test_write_data_by_id_success():
    transport = MockTransport()
    await transport.connect()
    adapter = ELM327Adapter(transport)
    await adapter.initialize()
    await adapter.set_module_address(0x09)

    uds = UDSClient(adapter)
    async with uds:
        orig = await uds.read_data_by_id(DID_BCM_LONG_CODING)
        mod = bytearray(orig)
        mod[0] ^= 0x01  # Toggle bit 0

        await uds.write_data_by_id(DID_BCM_LONG_CODING, bytes(mod))
        # Verify mock transport received update
        assert transport.bcm_coding[0] == mod[0]

    await transport.disconnect()


@pytest.mark.asyncio
async def test_write_negative_response():
    transport = MockTransport(simulate_write_nrc="22")  # 0x22 = ConditionsNotCorrect
    await transport.connect()
    adapter = ELM327Adapter(transport)
    await adapter.initialize()
    await adapter.set_module_address(0x09)

    uds = UDSClient(adapter)
    async with uds:
        with pytest.raises(NegativeResponseError) as exc_info:
            await uds.write_data_by_id(DID_BCM_LONG_CODING, bytes([0x00] * 30))

        assert exc_info.value.nrc == 0x22
        assert "Conditions Not Correct" in str(exc_info.value)

    await transport.disconnect()


@pytest.mark.asyncio
async def test_read_and_clear_dtcs():
    transport = MockTransport()
    await transport.connect()
    adapter = ELM327Adapter(transport)
    await adapter.initialize()
    await adapter.set_module_address(0x09)

    uds = UDSClient(adapter)
    async with uds:
        dtcs = await uds.read_dtcs()
        assert len(dtcs) > 0

        # Clear DTCs
        success = await uds.clear_dtcs()
        assert success is True

        # Re-read
        dtcs_cleared = await uds.read_dtcs()
        assert len(dtcs_cleared) == 0

    await transport.disconnect()
