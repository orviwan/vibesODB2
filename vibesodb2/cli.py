"""
vibesODB2 Unified Command Line Interface.
Provides scan, dump, set, backups, dtc, schema, live, and web commands across VAG platforms.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Confirm
from rich.table import Table

from vibesodb2.adapter.elm327 import ELM327Adapter, MODULE_REGISTRY
from vibesodb2.ble.discovery import scan_for_adapters
from vibesodb2.ble.mock_transport import MockTransport
from vibesodb2.ble.transport import BleNordicUartTransport, Transport
from vibesodb2.safety.bitwise import compute_byte_diff, format_hex_dump
from vibesodb2.safety.guardrails import SafetyEngine
from vibesodb2.safety.storage import StorageManager
from vibesodb2.schema.loader import SchemaLoader
from vibesodb2.schema.models import VehicleFeature
from vibesodb2.schema.platforms import detect_platform_from_vin, get_supported_platforms
from vibesodb2.uds.client import UDSClient
from vibesodb2.uds.constants import DID_BCM_LONG_CODING, DID_VIN

console = Console()


def get_transport(mac: Optional[str], mock: bool, rpm: int = 0) -> Transport:
    if mock or not mac:
        if not mock and not mac:
            console.print("[dim yellow]No --mac provided. Operating in Simulated Mock Mode (--mock).[/dim yellow]")
        return MockTransport(engine_rpm=rpm)
    return BleNordicUartTransport(mac_or_uuid=mac)


async def cmd_scan(args) -> int:
    console.print("[bold cyan]Scanning for BLE OBD-II adapters...[/bold cyan]")
    try:
        adapters = await scan_for_adapters(timeout=args.timeout)
        if not adapters:
            console.print("[yellow]No compatible BLE adapters detected. Ensure adapter is powered and within range.[/yellow]")
            return 0

        table = Table(title="Discovered BLE OBD-II Adapters", border_style="cyan")
        table.add_column("Device Name", style="bold white")
        table.add_column("Address / MAC", style="cyan")
        table.add_column("RSSI (dBm)", justify="right")
        table.add_column("Status", justify="center")

        for a in adapters:
            status = "[bold green]RECOMMENDED[/bold green]" if a.is_recommended else "[dim]COMPATIBLE[/dim]"
            table.add_row(a.name, a.address, str(a.rssi), status)

        console.print(table)
        return 0
    except Exception as e:
        console.print(f"[bold red]Scan error:[/bold red] {e}")
        return 1


async def cmd_dump(args) -> int:
    module_addr = int(args.module, 16)
    transport = get_transport(args.mac, args.mock, args.rpm)
    safety = SafetyEngine()
    schema_loader = SchemaLoader(safety.storage)

    try:
        safety.validate_module_allowed(module_addr)
        await transport.connect()
        adapter = ELM327Adapter(transport)
        await adapter.initialize()

        if not args.skip_safety:
            await safety.validate_engine_off(adapter)

        mod_cfg = await adapter.set_module_address(module_addr)
        uds = UDSClient(adapter)

        async with uds:
            # Query VIN
            vin = "UNKNOWN_VIN"
            try:
                vin_bytes = await uds.read_data_by_id(DID_VIN)
                vin = vin_bytes.decode("ascii", errors="replace").strip()
            except Exception:
                pass

            # Detect platform
            plat_info = detect_platform_from_vin(vin)
            if plat_info:
                console.print(f"[bold green]Vehicle Identified:[/bold green] [bold white]{plat_info.brand} {plat_info.model}[/bold white] ({plat_info.years}) - Platform [bold cyan]{plat_info.code}[/bold cyan]")
            selected_plat = args.platform or (plat_info.code if plat_info else "PQ25")

            schema = schema_loader.get_schema(module_address=module_addr, platform=selected_plat)
            did = mod_cfg.default_coding_did
            coding_bytes = await uds.read_data_by_id(did)

            # Auto backup
            backup = safety.execute_prewrite_backup(
                vin=vin,
                module_address=module_addr,
                did=did,
                original_payload=coding_bytes,
            )

            console.print(
                Panel(
                    f"[bold white]{coding_bytes.hex().upper()}[/bold white]\n\n[dim]{format_hex_dump(coding_bytes)}[/dim]",
                    title=f"[bold]{mod_cfg.name} (0x{module_addr:02X}) Long Coding [{len(coding_bytes)} Bytes][/bold]",
                    border_style="green",
                )
            )
            console.print(f"[dim]Snapshot saved as Backup #{backup.id} (VIN: {vin}, Platform: {selected_plat})[/dim]")

            if schema:
                feature_states = schema.evaluate_features(coding_bytes)
                table = Table(title=f"Decoded Features ({schema.platform} Schema - {len(schema.features)} settings)", border_style="dim")
                table.add_column("Category", style="cyan")
                table.add_column("Feature ID", style="bold white")
                table.add_column("Name", style="white")
                table.add_column("Coord", style="dim")
                table.add_column("State", justify="center")

                for f in schema.features:
                    active = feature_states.get(f.id, False)
                    status_str = "[bold green]ON[/bold green]" if active else "[dim]OFF[/dim]"
                    table.add_row(f.category, f.id, f.name, f"B{f.byte}:b{f.bit}", status_str)

                console.print(table)
        return 0
    except Exception as e:
        console.print(f"[bold red]Error dumping module 0x{module_addr:02X}:[/bold red] {e}")
        return 1
    finally:
        await transport.disconnect()


async def cmd_set(args) -> int:
    module_addr = int(args.module, 16)
    feature_id = args.feature
    new_state = args.enable

    safety = SafetyEngine()
    schema_loader = SchemaLoader(safety.storage)
    transport = get_transport(args.mac, args.mock, args.rpm)

    try:
        safety.validate_module_allowed(module_addr)
        await transport.connect()
        adapter = ELM327Adapter(transport)
        await adapter.initialize()

        if not args.skip_safety:
            await safety.validate_engine_off(adapter)

        mod_cfg = await adapter.set_module_address(module_addr)
        uds = UDSClient(adapter)

        async with uds:
            # Query VIN
            vin = "UNKNOWN_VIN"
            try:
                vin_bytes = await uds.read_data_by_id(DID_VIN)
                vin = vin_bytes.decode("ascii", errors="replace").strip()
            except Exception:
                pass

            plat_info = detect_platform_from_vin(vin)
            selected_plat = args.platform or (plat_info.code if plat_info else "PQ25")

            schema = schema_loader.get_schema(module_address=module_addr, platform=selected_plat)
            if not schema:
                console.print(f"[bold red]No schema found for module 0x{module_addr:02X} on platform {selected_plat}.[/bold red]")
                return 1

            feature = schema.get_feature(feature_id)
            if not feature:
                console.print(f"[bold red]Feature '{feature_id}' not defined in {selected_plat} module schema.[/bold red]")
                return 1

            did = mod_cfg.default_coding_did
            orig_bytes = await uds.read_data_by_id(did)
            mod_bytes = bytearray(orig_bytes)

            schema.apply_feature(mod_bytes, feature_id, new_state)

            diffs = compute_byte_diff(orig_bytes, mod_bytes)
            if not diffs:
                console.print(f"[yellow]Feature '{feature_id}' is already {'ENABLED' if new_state else 'DISABLED'}. No modification required.[/yellow]")
                return 0

            # Present Pre-Write Audit Table
            table = Table(title=f"Pre-Write Safety Audit: {feature.name}", border_style="yellow")
            table.add_column("Byte", justify="center")
            table.add_column("Original Hex", justify="center", style="dim")
            table.add_column("Modified Hex", justify="center", style="bold green")
            table.add_column("Bit Changes", style="cyan")

            for d in diffs:
                bit_changes = ", ".join(f"b{cb.bit_index} ({cb.old_value}->{cb.new_value})" for cb in d.changed_bits)
                table.add_row(f"Byte {d.byte_index}", d.old_hex, d.new_hex, bit_changes)

            console.print(table)

            if not args.yes:
                confirmed = Confirm.ask(f"Do you want to write this modification to Module 0x{module_addr:02X} ({selected_plat})?")
                if not confirmed:
                    console.print("[yellow]Write operation aborted by user.[/yellow]")
                    return 0

            # Safe write with pre-write snapshot and rollback
            backup = await safety.execute_safe_write(
                uds_client=uds,
                module_address=module_addr,
                did=did,
                original_bytes=orig_bytes,
                modified_bytes=bytes(mod_bytes),
                vin=vin,
                skip_engine_check=args.skip_safety,
            )

            console.print(
                f"[bold green]✓ Write Confirmed by ECU (0x6E)![/bold green] "
                f"Backup snapshot stored as [bold cyan]#{backup.id}[/bold cyan]."
            )
            return 0
    except Exception as e:
        console.print(f"[bold red]Set operation failed:[/bold red] {e}")
        return 1
    finally:
        await transport.disconnect()


async def cmd_backups(args) -> int:
    storage = StorageManager()
    if args.restore:
        backup_id = int(args.restore)
        backup = storage.get_backup_by_id(backup_id)
        if not backup:
            console.print(f"[bold red]Backup #{backup_id} not found.[/bold red]")
            return 1

        module_addr = int(backup.module_address, 16)
        did = int(backup.did, 16)
        restore_bytes = bytes.fromhex(backup.raw_hex_data)

        console.print(
            Panel(
                f"Backup ID: #{backup.id}\nTimestamp: {backup.timestamp}\nVIN: {backup.vin}\n"
                f"Module: {backup.module_address}\nDID: {backup.did}\nHex Payload: {backup.raw_hex_data}",
                title="[bold yellow]Rollback Restore Target[/bold yellow]",
                border_style="yellow",
            )
        )

        if not args.yes:
            if not Confirm.ask(f"Are you sure you want to rollback Module {backup.module_address} to Backup #{backup_id}?"):
                console.print("[yellow]Rollback aborted.[/yellow]")
                return 0

        transport = get_transport(args.mac, args.mock, args.rpm)
        safety = SafetyEngine(storage)
        try:
            safety.validate_module_allowed(module_addr)
            await transport.connect()
            adapter = ELM327Adapter(transport)
            await adapter.initialize()

            if not args.skip_safety:
                await safety.validate_engine_off(adapter)

            await adapter.set_module_address(module_addr)
            uds = UDSClient(adapter)
            async with uds:
                current_bytes = await uds.read_data_by_id(did)
                await safety.execute_safe_write(
                    uds_client=uds,
                    module_address=module_addr,
                    did=did,
                    original_bytes=current_bytes,
                    modified_bytes=restore_bytes,
                    vin=backup.vin,
                    skip_engine_check=args.skip_safety,
                )
                console.print(f"[bold green]✓ Rollback to Backup #{backup_id} completed successfully![/bold green]")
                return 0
        except Exception as e:
            console.print(f"[bold red]Rollback failed:[/bold red] {e}")
            return 1
        finally:
            await transport.disconnect()

    backups = storage.list_backups()
    if not backups:
        console.print("[dim]No backups recorded in local SQLite database yet.[/dim]")
        return 0

    table = Table(title="Saved Factory & Pre-Write Snapshots", border_style="cyan")
    table.add_column("ID", justify="right", style="cyan")
    table.add_column("Timestamp", style="dim")
    table.add_column("VIN", style="white")
    table.add_column("Module", style="bold white")
    table.add_column("DID", style="dim")
    table.add_column("Length", justify="right")
    table.add_column("Payload Hex Preview", style="dim")

    for b in backups:
        data_len = len(bytes.fromhex(b.raw_hex_data))
        preview = b.raw_hex_data[:16] + "..." if len(b.raw_hex_data) > 16 else b.raw_hex_data
        table.add_row(str(b.id), b.timestamp[:19], b.vin, b.module_address, b.did, f"{data_len} B", preview)

    console.print(table)
    return 0


async def cmd_dtc(args) -> int:
    module_addr = int(args.module, 16)
    transport = get_transport(args.mac, args.mock, args.rpm)
    safety = SafetyEngine()

    try:
        safety.validate_module_allowed(module_addr)
        await transport.connect()
        adapter = ELM327Adapter(transport)
        await adapter.initialize()
        await adapter.set_module_address(module_addr)

        uds = UDSClient(adapter)
        async with uds:
            if args.clear:
                console.print(f"[bold yellow]Clearing DTCs on Module 0x{module_addr:02X}...[/bold yellow]")
                success = await uds.clear_dtcs()
                if success:
                    console.print("[bold green]✓ Fault codes successfully cleared (0x14 ack received).[/bold green]")
                else:
                    console.print("[red]Failed to clear fault codes.[/red]")
                return 0

            dtcs = await uds.read_dtcs()
            if not dtcs:
                console.print(f"[bold green]✓ No DTCs (fault codes) present on Module 0x{module_addr:02X}.[/bold green]")
                return 0

            table = Table(title=f"Diagnostic Trouble Codes (Module 0x{module_addr:02X})", border_style="red")
            table.add_column("DTC Code", style="bold red")
            table.add_column("Status Mask", style="dim")
            table.add_column("Confirmed", justify="center")
            table.add_column("Pending", justify="center")

            for d in dtcs:
                table.add_row(
                    d["code"],
                    d["status_mask"],
                    "[red]YES[/red]" if d["confirmed"] else "[dim]NO[/dim]",
                    "[yellow]YES[/yellow]" if d["pending"] else "[dim]NO[/dim]",
                )

            console.print(table)
            return 0
    except Exception as e:
        console.print(f"[bold red]DTC operation failed:[/bold red] {e}")
        return 1
    finally:
        await transport.disconnect()


def cmd_schema(args) -> int:
    loader = SchemaLoader()

    if args.subcommand == "list":
        schemas = loader.list_schemas()
        table = Table(title="Registered VAG Platform Schemas", border_style="cyan")
        table.add_column("Platform", style="bold cyan")
        table.add_column("Module", style="bold white")
        table.add_column("Tx/Rx", style="dim")
        table.add_column("Expected Len", justify="right")
        table.add_column("Features Count", justify="right", style="green")

        for s in schemas:
            table.add_row(
                s.platform,
                s.module_address,
                f"{s.tx_header}/{s.rx_filter}",
                f"{s.expected_byte_length} B",
                str(len(s.features)),
            )
        console.print(table)
        return 0

    elif args.subcommand == "add":
        feat = VehicleFeature(
            id=args.id,
            category=args.category,
            byte=args.byte,
            bit=args.bit,
            name=args.name,
            description=args.desc,
            prerequisites=args.prereq,
        )
        loader.add_custom_feature(platform=args.platform, module_address=args.module, feature=feat)
        console.print(f"[bold green]✓ Custom setting '{args.name}' (Byte {args.byte} Bit {args.bit}) saved for {args.platform} {args.module}![/bold green]")
        return 0

    elif args.subcommand == "export":
        out_file = args.out or f"schema_{args.platform.lower()}_{args.module.lower()}.json"
        exported_json = loader.export_community_schema(
            platform=args.platform,
            module_address=args.module,
            output_path=out_file,
        )
        console.print(f"[bold green]✓ Exported GitHub PR ready schema ({len(exported_json)} chars) to [cyan]{out_file}[/cyan][/bold green]")
        return 0

async def cmd_live(args) -> int:
    from rich.live import Live
    from vibesodb2.telemetry.engine import TelemetryEngine

    transport = get_transport(args.mac, args.mock, args.rpm)
    if isinstance(transport, MockTransport):
        transport.simulate_drive_cycle = True
        if hasattr(args, "drive_mode") and args.drive_mode:
            transport.drive_cycle.mode = args.drive_mode

    try:
        console.print("[bold cyan]Connecting and launching real-time telemetry engine...[/bold cyan]")
        await transport.connect()
        adapter = ELM327Adapter(transport)
        await adapter.initialize()

        engine = TelemetryEngine(adapter=adapter, fast_rate_target_hz=args.rate)
        queue = engine.subscribe()
        await engine.start()

        def make_layout(data: dict) -> Panel:
            spd = data.get("speed", 0.0)
            mph = spd * 0.621371
            rpm = data.get("rpm", 0.0)
            gear = int(data.get("gear", 0))
            gear_str = f"Gear {gear}" if gear > 0 else "N"
            boost = data.get("boost", 0.0)
            coolant = data.get("coolant_temp", 0.0)
            iat = data.get("iat", 0.0)
            fuel = data.get("fuel_rail_pressure", 0.0)
            throttle = data.get("throttle", 0.0)
            egt = data.get("egt_turbo", 0.0)
            soot = data.get("dpf_soot", 0.0)
            hz = data.get("sampling_hz", 0.0)
            lat = data.get("latency_ms", 0.0)
            pkts = data.get("packets_count", 0)

            # RPM Bar (30 blocks)
            rpm_ratio = min(1.0, max(0.0, rpm / 6000.0))
            filled = int(rpm_ratio * 30)
            rpm_color = "red" if rpm > 4800 else ("yellow" if rpm > 3200 else "green")
            rpm_bar = f"[{rpm_color}]{'█' * filled}[/{rpm_color}]{'░' * (30 - filled)}"

            # Boost Bar (20 blocks up to 2.0 bar)
            boost_ratio = min(1.0, max(0.0, boost / 2.0))
            b_filled = int(boost_ratio * 20)
            boost_color = "red" if boost > 1.8 else ("cyan" if boost > 0.5 else "dim")
            boost_bar = f"[{boost_color}]{'█' * b_filled}[/{boost_color}]{'░' * (20 - b_filled)}"

            content = f"""
 [bold cyan]SPEED:[/bold cyan]  [bold white]{int(spd):3d}[/bold white] km/h  [dim]({mph:4.1f} mph)[/dim]          [bold magenta]GEAR:[/bold magenta] [bold white]{gear_str}[/bold white]   [bold yellow]THROTTLE:[/bold yellow] [bold white]{throttle:4.1f}%[/bold white]
 [bold cyan]RPM:  [/bold cyan]  {rpm_bar}  [bold white]{int(rpm):4d}[/bold white] RPM
 [bold cyan]BOOST:[/bold cyan]  {boost_bar}  [bold white]{boost:4.2f}[/bold white] bar

 ────────────────────────────────────────────────────────────────────────
  [dim]Coolant Temp:[/dim] [bold]{coolant:4.1f} °C[/bold]     [dim]Intake Air:[/dim]  [bold]{iat:4.1f} °C[/bold]     [dim]Fuel Rail:[/dim] [bold]{fuel:6.1f} bar[/bold]
  [dim]DPF Soot:    [/dim] [bold]{soot:4.2f} g[/bold]      [dim]Turbo EGT: [/dim] [bold]{egt:4.1f} °C[/bold]     [dim]Voltage:  [/dim] [bold]{adapter.voltage}[/bold]
 ────────────────────────────────────────────────────────────────────────
  [dim]Telemetry Loop:[/dim] [bold green]{hz:4.1f} Hz[/bold green] | [dim]Latency:[/dim] [bold]{lat:4.1f} ms[/bold] | [dim]Packets:[/dim] [bold]{pkts}[/bold] | [dim yellow]Ctrl+C to stop[/dim yellow]
"""
            return Panel(content.strip(), title="[bold cyan]🏎️ vibesODB2 Live Telemetry Dashboard[/bold cyan]", border_style="cyan")

        with Live(make_layout(engine.latest_data), refresh_per_second=20, console=console) as live:
            while True:
                data = await queue.get()
                live.update(make_layout(data))

    except (KeyboardInterrupt, asyncio.CancelledError):
        console.print("\n[yellow]Telemetry dashboard stopped.[/yellow]")
        return 0
    except Exception as e:
        console.print(f"[bold red]Telemetry error:[/bold red] {e}")
        return 1
    finally:
        if 'engine' in locals():
            await engine.stop()
        await transport.disconnect()


def cmd_web(args) -> int:
    import uvicorn
    console.print(
        Panel.fit(
            f"[bold cyan]Starting vibesODB2 Web Dashboard on http://{args.host}:{args.port}[/bold cyan]\n"
            f"[dim]Mode: {'Simulated Testbench (--mock)' if args.mock else 'Live Hardware (BLE)'}[/dim]",
            border_style="cyan",
        )
    )
    import os
    if args.mock:
        os.environ["VIBESODB2_MOCK"] = "1"
        os.environ["OPENTRANSPORTER_MOCK"] = "1"
    if args.mac:
        os.environ["VIBESODB2_MAC"] = args.mac
        os.environ["OPENTRANSPORTER_MAC"] = args.mac
    if args.platform:
        os.environ["VIBESODB2_PLATFORM"] = args.platform
        os.environ["OPENTRANSPORTER_PLATFORM"] = args.platform

    uvicorn.run("vibesodb2.web.app:app", host=args.host, port=args.port, reload=False)
    return 0


def main():
    common_parser = argparse.ArgumentParser(add_help=False)
    common_parser.add_argument("--mac", type=str, default=None, help="BLE adapter MAC / Address")
    common_parser.add_argument("--mock", action="store_true", help="Run against simulated ECU & vLinker adapter")
    common_parser.add_argument("--rpm", type=int, default=0, help="Simulated engine RPM for mock testing")
    common_parser.add_argument("--platform", type=str, default=None, choices=["PQ25", "PQ35", "MQB"], help="VAG Platform architecture override")
    common_parser.add_argument("--skip-safety", action="store_true", help="Skip engine-off verification (test benches only)")

    parser = argparse.ArgumentParser(
        prog="vibesodb2",
        description="vibesODB2: VAG (PQ25 / PQ35 / MQB) Diagnostic & Long Coding Engine",
        parents=[common_parser],
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # scan
    p_scan = subparsers.add_parser("scan", parents=[common_parser], help="Scan for nearby BLE OBD-II adapters")
    p_scan.add_argument("--timeout", type=float, default=5.0, help="Scan timeout in seconds")

    # dump
    p_dump = subparsers.add_parser("dump", parents=[common_parser], help="Read Long Coding from a module and decode features")
    p_dump.add_argument("--module", type=str, default="0x09", help="Module address in hex (default: 0x09 BCM)")

    # set
    p_set = subparsers.add_parser("set", parents=[common_parser], help="Modify a vehicle feature bit with safety verification")
    p_set.add_argument("--module", type=str, default="0x09", help="Module address (default: 0x09)")
    p_set.add_argument("--feature", type=str, required=True, help="Feature ID to modify (e.g. cornering_fog_lights)")
    state_group = p_set.add_mutually_exclusive_group(required=True)
    state_group.add_argument("--enable", dest="enable", action="store_true", help="Enable target feature")
    state_group.add_argument("--disable", dest="enable", action="store_false", help="Disable target feature")
    p_set.add_argument("-y", "--yes", action="store_true", help="Skip interactive confirmation prompt")

    # backups
    p_backups = subparsers.add_parser("backups", parents=[common_parser], help="List snapshots or restore a previous backup")
    p_backups.add_argument("--restore", type=int, default=None, help="Backup ID to restore")
    p_backups.add_argument("-y", "--yes", action="store_true", help="Skip rollback confirmation")

    # dtc
    p_dtc = subparsers.add_parser("dtc", parents=[common_parser], help="Read or clear Diagnostic Trouble Codes (DTCs)")
    p_dtc.add_argument("--module", type=str, default="0x09", help="Module address (default: 0x09)")
    p_dtc.add_argument("--clear", action="store_true", help="Clear DTCs on target module")

    # schema
    p_schema = subparsers.add_parser("schema", parents=[common_parser], help="Manage and export settings schemas")
    schema_subs = p_schema.add_subparsers(dest="subcommand", required=True)

    schema_subs.add_parser("list", help="List all registered platform schemas")

    p_sch_add = schema_subs.add_parser("add", help="Add custom feature override")
    p_sch_add.add_argument("--platform", type=str, default="PQ25", choices=["PQ25", "PQ35", "MQB"])
    p_sch_add.add_argument("--module", type=str, default="0x09")
    p_sch_add.add_argument("--id", type=str, required=True, help="Unique feature ID (e.g. custom_drl_mode)")
    p_sch_add.add_argument("--category", type=str, default="Custom Settings")
    p_sch_add.add_argument("--byte", type=int, required=True, help="Byte index (0-29)")
    p_sch_add.add_argument("--bit", type=int, required=True, help="Bit index (0-7)")
    p_sch_add.add_argument("--name", type=str, required=True, help="Display Name")
    p_sch_add.add_argument("--desc", type=str, required=True, help="Description")
    p_sch_add.add_argument("--prereq", type=str, default=None, help="Prerequisites")

    p_sch_exp = schema_subs.add_parser("export", help="Export GitHub-ready community schema")
    p_sch_exp.add_argument("--platform", type=str, default="PQ25", choices=["PQ25", "PQ35", "MQB"])
    p_sch_exp.add_argument("--module", type=str, default="0x09")
    p_sch_exp.add_argument("--out", type=str, default=None, help="Output JSON path")

    # live (real-time telemetry)
    p_live = subparsers.add_parser("live", parents=[common_parser], help="Start real-time digital telemetry dashboard HUD")
    p_live.add_argument("--rate", type=float, default=30.0, help="Target fast polling rate in Hz (default: 30 Hz)")
    p_live.add_argument("--drive-mode", type=str, default="city", choices=["idle", "city", "highway", "spirited"], help="Simulated drive cycle mode")

    # web
    p_web = subparsers.add_parser("web", parents=[common_parser], help="Launch interactive Web Dashboard")
    p_web.add_argument("--host", type=str, default="127.0.0.1", help="Host interface (default: 127.0.0.1)")
    p_web.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")

    args = parser.parse_args()

    if args.command == "scan":
        sys.exit(asyncio.run(cmd_scan(args)))
    elif args.command == "dump":
        sys.exit(asyncio.run(cmd_dump(args)))
    elif args.command == "set":
        sys.exit(asyncio.run(cmd_set(args)))
    elif args.command == "backups":
        sys.exit(asyncio.run(cmd_backups(args)))
    elif args.command == "dtc":
        sys.exit(asyncio.run(cmd_dtc(args)))
    elif args.command == "schema":
        sys.exit(cmd_schema(args))
    elif args.command == "live":
        sys.exit(asyncio.run(cmd_live(args)))
    elif args.command == "web":
        sys.exit(cmd_web(args))


if __name__ == "__main__":
    main()
