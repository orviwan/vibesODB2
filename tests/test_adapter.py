"""
Unit tests for ELM327 / vLinker adapter driver and ISO-TP handler.
"""

import pytest
from vibesodb2.adapter.elm327 import ELM327Adapter, MODULE_REGISTRY
from vibesodb2.adapter.isotp import (
    IsoTpReassembler,
    packetize_isotp,
    create_flow_control_frame,
)
from vibesodb2.ble.mock_transport import MockTransport


@pytest.mark.asyncio
async def test_elm327_initialization():
    transport = MockTransport()
    await transport.connect()

    adapter = ELM327Adapter(transport)
    version = await adapter.initialize()

    assert "ELM327" in version
    assert transport.echo is False
    assert transport.spaces is False
    assert transport.linefeeds is False
    assert transport.can_formatting is True
    assert transport.protocol == "6"

    await transport.disconnect()


@pytest.mark.asyncio
async def test_module_arbitration_switching():
    transport = MockTransport()
    await transport.connect()

    adapter = ELM327Adapter(transport)
    await adapter.initialize()

    # Switch to BCM (0x09)
    cfg = await adapter.set_module_address(0x09)
    assert cfg.tx_header == "70E"
    assert cfg.rx_filter == "778"
    assert transport.tx_header == "70E"
    assert transport.rx_filter == "778"

    # Switch to Cluster (0x17)
    cfg_cluster = await adapter.set_module_address(0x17)
    assert cfg_cluster.tx_header == "714"
    assert transport.tx_header == "714"

    # Invalid module
    with pytest.raises(ValueError):
        await adapter.set_module_address(0x99)

    await transport.disconnect()


@pytest.mark.asyncio
async def test_read_engine_rpm():
    transport = MockTransport(engine_rpm=0)
    await transport.connect()
    adapter = ELM327Adapter(transport)
    await adapter.initialize()

    rpm = await adapter.read_engine_rpm()
    assert rpm == 0

    transport.engine_rpm = 950
    rpm_running = await adapter.read_engine_rpm()
    assert abs(rpm_running - 950) <= 2

    await transport.disconnect()


def test_isotp_single_frame():
    reassembler = IsoTpReassembler()
    # Single frame: length 3, data: [0x22, 0x06, 0x00]
    frame = bytes([0x03, 0x22, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00])
    result = reassembler.process_frame(frame)
    assert result == bytes([0x22, 0x06, 0x00])


def test_isotp_multi_frame():
    reassembler = IsoTpReassembler()
    # Total length 10 bytes: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A]
    # First Frame: 0x10 0x0A, followed by 6 data bytes
    ff = bytes([0x10, 0x0A, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06])
    assert reassembler.process_frame(ff) is None
    assert reassembler.in_progress is True

    # Consecutive Frame 1: 0x21, followed by 4 remaining bytes + padding
    cf1 = bytes([0x21, 0x07, 0x08, 0x09, 0x0A, 0x00, 0x00, 0x00])
    result = reassembler.process_frame(cf1)
    assert result == bytes([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A])
    assert reassembler.in_progress is False


def test_packetize_isotp():
    payload = bytes(range(10))  # 10 bytes
    frames = packetize_isotp(payload)
    assert len(frames) == 2
    # FF: 0x10 0x0A
    assert frames[0][0] == 0x10
    assert frames[0][1] == 0x0A
    # CF: 0x21
    assert frames[1][0] == 0x21

    # Reassemble back
    reassembler = IsoTpReassembler()
    reassembler.process_frame(frames[0])
    res = reassembler.process_frame(frames[1])
    assert res == payload
