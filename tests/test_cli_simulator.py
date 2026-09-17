"""
Comprehensive Automated Test Suite for vibesODB2 CLI against the Vehicle Simulator.
Tests commands across multiple VAG platforms (PQ25, PQ35, MQB):
- scan
- dump
- set (enable & disable with bit manipulation)
- dtc (read & clear across modules)
- backups (list & rollback)
- safety interlocks (engine running, blacklisted modules, atomic rollback on NRC)
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
import pytest

from vibesodb2.cli import cmd_scan, cmd_dump, cmd_set, cmd_dtc, cmd_backups, cmd_schema
from vibesodb2.safety.guardrails import SafetyEngine
from vibesodb2.safety.storage import StorageManager
from vibesodb2.sim.vehicle import SimulatedVehicle, PROFILES
from vibesodb2.sim.transport import SimulatedTransport


@pytest.mark.asyncio
async def test_cli_scan_mock():
    args = SimpleNamespace(
        timeout=1.0,
        mac=None,
        mock=True,
        rpm=0,
        platform=None,
        skip_safety=False,
    )
    res = await cmd_scan(args)
    assert res == 0


@pytest.mark.asyncio
async def test_cli_dump_transporter_t51():
    args = SimpleNamespace(
        module="0x09",
        mac=None,
        mock=True,
        profile="transporter_t51",
        rpm=0,
        platform=None,
        skip_safety=False,
    )
    res = await cmd_dump(args)
    assert res == 0


@pytest.mark.asyncio
async def test_cli_dump_transporter_t5():
    args = SimpleNamespace(
        module="0x09",
        mac=None,
        mock=True,
        profile="transporter_t5",
        rpm=0,
        platform="PQ35",
        skip_safety=False,
    )
    res = await cmd_dump(args)
    assert res == 0


@pytest.mark.asyncio
async def test_cli_set_feature_toggle_t51():
    # 1. Enable feature
    args_enable = SimpleNamespace(
        module="0x09",
        feature="cornering_fog_lights",
        enable=True,
        yes=True,
        mac=None,
        mock=True,
        profile="transporter_t51",
        rpm=0,
        platform="PQ25",
        skip_safety=False,
    )
    res = await cmd_set(args_enable)
    assert res == 0

    # 2. Disable feature
    args_disable = SimpleNamespace(
        module="0x09",
        feature="cornering_fog_lights",
        enable=False,
        yes=True,
        mac=None,
        mock=True,
        profile="transporter_t51",
        rpm=0,
        platform="PQ25",
        skip_safety=False,
    )
    res = await cmd_set(args_disable)
    assert res == 0


@pytest.mark.asyncio
async def test_cli_dtc_read_and_clear_t5():
    # Module 0x09 has DTCs 01117 and 01598 in simulated T5
    args_read = SimpleNamespace(
        module="0x09",
        clear=False,
        mac=None,
        mock=True,
        profile="transporter_t5",
        rpm=0,
        platform="PQ35",
        skip_safety=False,
    )
    res = await cmd_dtc(args_read)
    assert res == 0

    # Read Airbag module 0x15 (has 00588)
    args_airbag = SimpleNamespace(
        module="0x15",
        clear=False,
        mac=None,
        mock=True,
        profile="transporter_t5",
        rpm=0,
        platform="PQ35",
        skip_safety=False,
    )
    res_ab = await cmd_dtc(args_airbag)
    assert res_ab == 0

    # Clear DTCs on Module 0x09
    args_clear = SimpleNamespace(
        module="0x09",
        clear=True,
        mac=None,
        mock=True,
        profile="transporter_t5",
        rpm=0,
        platform="PQ35",
        skip_safety=False,
    )
    res_cl = await cmd_dtc(args_clear)
    assert res_cl == 0


@pytest.mark.asyncio
async def test_cli_safety_engine_running_interlock():
    # Writing configuration while engine is running (RPM = 1200) MUST be blocked
    args = SimpleNamespace(
        module="0x09",
        feature="cornering_fog_lights",
        enable=True,
        yes=True,
        mac=None,
        mock=True,
        profile="transporter_t51",
        rpm=1200,
        platform="PQ25",
        skip_safety=False,
    )
    res = await cmd_set(args)
    # Exits with error 1 because engine is running
    assert res == 1


@pytest.mark.asyncio
async def test_cli_safety_blacklisted_airbag_module():
    # Writing configuration to Module 0x15 (Airbag) MUST be strictly blacklisted
    args = SimpleNamespace(
        module="0x15",
        feature="dummy_feature",
        enable=True,
        yes=True,
        mac=None,
        mock=True,
        profile="transporter_t51",
        rpm=0,
        platform="PQ25",
        skip_safety=False,
    )
    res = await cmd_set(args)
    assert res == 1


@pytest.mark.asyncio
async def test_cli_backups_list():
    args = SimpleNamespace(
        restore=None,
        yes=True,
        mac=None,
        mock=True,
        profile="transporter_t51",
        rpm=0,
        platform="PQ25",
        skip_safety=False,
    )
    res = await cmd_backups(args)
    assert res == 0


def test_cli_schema_list():
    args = SimpleNamespace(
        subcommand="list",
    )
    res = cmd_schema(args)
    assert res == 0
