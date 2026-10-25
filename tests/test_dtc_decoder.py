"""Tests for SAE J2012-DA / UDS 3-byte DTC encoding and decoding in Python simulator and UDSClient."""

from __future__ import annotations

import pytest

from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.sim.transport import SimulatedTransport
from vibesodb2.sim.vehicle import SimulatedDTC, SimulatedVehicle
from vibesodb2.uds.client import UDSClient, decode_uds_dtc_bytes, encode_sae_dtc_hex


def test_encode_and_decode_sae_j2012_dtc_bytes():
    assert encode_sae_dtc_hex("B104A15") == "904A15"
    assert encode_sae_dtc_hex("P0299") == "029900"
    assert encode_sae_dtc_hex("P2015", 0x00) == "201500"
    assert encode_sae_dtc_hex("U010087") == "C10087"
    assert encode_sae_dtc_hex("C10AC07") == "50AC07"

    b104a = decode_uds_dtc_bytes(0x90, 0x4A, 0x15, module_addr=0x09)
    assert b104a["formatted_code"] == "B104A-15"
    assert "short to battery" in b104a["failure_type"].lower() or "open" in b104a["failure_type"].lower()

    vag_532 = decode_uds_dtc_bytes(0x02, 0x14, 0x02, module_addr=0x09)
    assert vag_532["formatted_code"] == "00532"

    p0101 = decode_uds_dtc_bytes(0x01, 0x01, 0x00, module_addr=0x01)
    assert p0101["formatted_code"] == "P0101"


@pytest.mark.asyncio
async def test_python_simulator_and_uds_client_decode_transporter_t51_dtcs():
    vehicle = SimulatedVehicle(profile_id="transporter_t51", engine_running=False)
    vehicle.inject_dtc(0x01, SimulatedDTC(code="P0101", status_mask=0x2F))
    transport = SimulatedTransport(vehicle=vehicle)
    await transport.connect()

    adapter = ELM327Adapter(transport)
    await adapter.initialize()

    # Check BCM 0x09 (B104A15 + 00532)
    await adapter.set_module_address(0x09)
    uds = UDSClient(adapter)
    bcm_dtcs = await uds.read_dtcs()
    formatted_bcm = [d["formatted_code"] for d in bcm_dtcs]
    assert "B104A-15" in formatted_bcm
    assert "00532" in formatted_bcm

    # Check Engine 0x01 (P0101)
    await adapter.set_module_address(0x01)
    ecm_dtcs = await uds.read_dtcs()
    formatted_ecm = [d["formatted_code"] for d in ecm_dtcs]
    assert "P0101" in formatted_ecm

    await transport.disconnect()
