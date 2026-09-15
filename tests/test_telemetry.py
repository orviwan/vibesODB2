"""
Unit and Integration Tests for OpenTransporter Telemetry Engine and Digital Dashboard.
Verifies Mode 01 PID formulas, UDS DID decoders, Drive Cycle simulator,
multi-rate scheduler, and FastAPI WebSocket broadcasting.
"""

import asyncio
import pytest

from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.ble.mock_transport import MockTransport
from vibesodb2.telemetry.drive_cycle import DriveCycleSimulator
from vibesodb2.telemetry.engine import TelemetryEngine
from vibesodb2.telemetry.metrics import (
    FrequencyTier,
    METRIC_REGISTRY,
    decode_coolant_temp,
    decode_dpf_soot_mass,
    decode_dsg_gear,
    decode_egt_turbo,
    decode_fuel_rail_pressure,
    decode_iat,
    decode_map_pressure,
    decode_rpm,
    decode_runtime,
    decode_speed,
    decode_throttle_pos,
)


def test_telemetry_metric_catalog():
    assert "speed" in METRIC_REGISTRY
    assert "rpm" in METRIC_REGISTRY
    assert "boost" in METRIC_REGISTRY
    assert "coolant_temp" in METRIC_REGISTRY
    assert "dpf_soot" in METRIC_REGISTRY
    assert "egt_turbo" in METRIC_REGISTRY
    assert "gear" in METRIC_REGISTRY

    assert METRIC_REGISTRY["speed"].tier == FrequencyTier.FAST
    assert METRIC_REGISTRY["coolant_temp"].tier == FrequencyTier.SLOW
    assert METRIC_REGISTRY["dpf_soot"].tier == FrequencyTier.UDS


def test_decode_speed():
    # 0 km/h
    assert decode_speed("41 0D 00") == 0.0
    # 100 km/h (0x64 = 100)
    assert decode_speed("410D64\r\n") == 100.0
    # 120 km/h (0x78 = 120)
    assert decode_speed("410D78") == 120.0
    # Invalid response
    assert decode_speed("NODATA") is None


def test_decode_rpm():
    # 0 RPM
    assert decode_rpm("41 0C 00 00") == 0.0
    # 800 RPM: 800 * 4 = 3200 = 0x0C80
    assert decode_rpm("410C0C80") == 800.0
    # 2000 RPM: 2000 * 4 = 8000 = 0x1F40
    assert decode_rpm("410C1F40\r\n") == 2000.0
    # Invalid response
    assert decode_rpm("STOPPED") is None


def test_decode_coolant_temp():
    # 90 °C: A = 90 + 40 = 130 = 0x82
    assert decode_coolant_temp("410582") == 90.0
    # 0 °C: A = 40 = 0x28
    assert decode_coolant_temp("410528") == 0.0
    # -40 °C: A = 0 = 0x00
    assert decode_coolant_temp("410500") == -40.0


def test_decode_map_and_boost():
    # Atmospheric pressure (101 kPa): A = 101 = 0x65
    assert decode_map_pressure("410B65") == 101.0
    # Boost formula: max(0, (MAP - 101.3) / 100)
    boost_metric = METRIC_REGISTRY["boost"]
    # 220 kPa MAP -> (220 - 101.3)/100 ~ 1.19 bar
    assert boost_metric.decode("410BDC") == 1.19


def test_decode_throttle():
    # 0%
    assert decode_throttle_pos("411100") == 0.0
    # 100%: 0xFF = 255 -> 100.0%
    assert decode_throttle_pos("4111FF") == 100.0


def test_decode_iat():
    # 25 °C: A = 25 + 40 = 65 = 0x41
    assert decode_iat("410F41") == 25.0


def test_decode_fuel_rail():
    # 350 bar -> raw = 3500 = 0x0DAC
    assert decode_fuel_rail_pressure("41230DAC") == 350.0


def test_decode_runtime():
    # 120 seconds -> 0x0078
    assert decode_runtime("411F0078") == 120.0


def test_decode_uds_vag_extended():
    # DPF Soot: 14.82g -> raw = 1482 = 0x05CA
    assert decode_dpf_soot_mass("62115405CA") == 14.82

    # EGT Turbo: 280.0 °C -> raw = (280 + 40) * 10 = 3200 = 0x0C80
    assert decode_egt_turbo("6211550C80") == 280.0

    # Gear 3
    assert decode_dsg_gear("62115603") == 3.0
    # Gear N (0)
    assert decode_dsg_gear("62115600") == 0.0


def test_drive_cycle_simulator_profiles():
    sim = DriveCycleSimulator(mode="idle")
    st = sim.update()
    assert st.speed == 0.0
    assert 780.0 <= st.rpm <= 820.0
    assert st.gear == 0

    sim_hwy = DriveCycleSimulator(mode="highway")
    st_hwy = sim_hwy.update()
    assert st_hwy.gear == 6
    assert 110.0 <= st_hwy.speed <= 120.0

    sim_city = DriveCycleSimulator(mode="city")
    st_city = sim_city.update()
    assert st_city.runtime_s >= 0


@pytest.mark.asyncio
async def test_telemetry_engine_loop():
    transport = MockTransport(simulate_drive_cycle=True, drive_cycle_mode="spirited")
    await transport.connect()
    adapter = ELM327Adapter(transport)
    await adapter.initialize()

    engine = TelemetryEngine(
        adapter=adapter,
        fast_rate_target_hz=50.0,
        slow_interval_seconds=0.1,
        uds_interval_seconds=0.1,
    )

    queue = engine.subscribe()
    await engine.start()

    # Wait for at least 3 packets
    packets = []
    for _ in range(3):
        pkt = await asyncio.wait_for(queue.get(), timeout=2.0)
        packets.append(pkt)

    await engine.stop()
    engine.unsubscribe(queue)
    await transport.disconnect()

    assert len(packets) >= 3
    last = packets[-1]
    assert "speed" in last
    assert "rpm" in last
    assert "boost" in last
    assert "coolant_temp" in last
    assert "dpf_soot" in last
    assert "sampling_hz" in last

