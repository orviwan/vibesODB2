#!/usr/bin/env python3
"""
vibesODB2 - Standalone BCM Long Coding Dump & Verification Tool.
Extracts current configuration from Volkswagen Transporter T5.1/T6 Body Control Module (0x09).
Enforces Engine-Off check and saves immutable SQLite backup snapshot.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.ble.transport import BleNordicUartTransport
from vibesodb2.ble.mock_transport import MockTransport
from vibesodb2.safety.guardrails import SafetyEngine, EngineRunningInterlockError
from vibesodb2.safety.bitwise import format_hex_dump
from vibesodb2.safety.storage import StorageManager
from vibesodb2.schema.loader import SchemaLoader
from vibesodb2.uds.client import UDSClient
from vibesodb2.uds.constants import DID_BCM_LONG_CODING, DID_VIN

console = Console()


async def dump_bcm_workflow(mac: str | None = None, mock: bool = False, mock_rpm: int = 0) -> int:
    console.print(
        Panel.fit(
            "[bold cyan]vibesODB2[/bold cyan] - [bold white]BCM Long Coding Dump & Safety Snapshot[/bold white]\n"
            "[dim]Target: VW Transporter T5.1 / T6 (PQ25 Platform, Address 0x09 Central Electric)[/dim]",
            border_style="cyan",
        )
    )

    # 1. Instantiate transport
    if mock or not mac:
        if not mock and not mac:
            console.print("[yellow]No BLE MAC provided. Defaulting to Simulated ECU Mock Mode (--mock).[/yellow]")
        console.print("[bold green]Mode:[/bold green] Virtual STN/vLinker Simulator (PQ25 ECU Testbench)")
        transport = MockTransport(engine_rpm=mock_rpm)
    else:
        console.print(f"[bold green]Mode:[/bold green] Physical BLE GATT Transport -> [cyan]{mac}[/cyan]")
        transport = BleNordicUartTransport(mac_or_uuid=mac)

    safety = SafetyEngine()
    schema_loader = SchemaLoader(safety.storage)
    bcm_schema = schema_loader.get_schema(module_address="0x09", platform="PQ25_T51")

    try:
        # 2. Connect transport
        with console.status("[bold blue]Connecting to OBD-II adapter...[/bold blue]"):
            await transport.connect()

        # 3. Initialize Adapter
        adapter = ELM327Adapter(transport)
        with console.status("[bold blue]Initializing adapter protocol stack (ATZ, ATE0, ATCAF1, ATSP6)...[/bold blue]"):
            version = await adapter.initialize()
        console.print(f"[dim]Adapter Firmware:[/dim] [bold]{version}[/bold]")
        if adapter.voltage:
            console.print(f"[dim]Battery Voltage:[/dim]  [bold yellow]{adapter.voltage}[/bold yellow]")

        # 4. Engine-Off Safety Pre-flight Check
        with console.status("[bold yellow]Running Pre-Flight Safety Interlock (PID 010C Engine RPM)...[/bold yellow]"):
            try:
                rpm = await safety.validate_engine_off(adapter)
                console.print(f"[bold green]✓ Safety Check Passed:[/bold green] Engine is OFF ({rpm} RPM).")
            except EngineRunningInterlockError as err:
                console.print(f"[bold red]✗ Pre-flight Aborted:[/bold red] {err}")
                return 1

        # 5. Set Arbitration for BCM (0x09)
        await adapter.set_module_address(0x09)

        # 6. UDS Session & Diagnostics
        uds = UDSClient(adapter)
        async with uds:
            # Query VIN
            vin = "UNKNOWN_VIN"
            try:
                vin_bytes = await uds.read_data_by_id(DID_VIN)
                vin = vin_bytes.decode("ascii", errors="replace").strip()
                console.print(f"[dim]Vehicle VIN:[/dim]      [bold cyan]{vin}[/bold cyan]")
            except Exception:
                console.print("[dim]Vehicle VIN:[/dim]      [dim]Could not query DID 0xF190 (using default)[/dim]")

            # Read Long Coding (DID 0x0600)
            with console.status("[bold blue]Reading Long Coding array via UDS Service 0x22 DID 0x0600...[/bold blue]"):
                coding_bytes = await uds.read_data_by_id(DID_BCM_LONG_CODING)

            console.print(f"[bold green]✓ Read Success:[/bold green] Received {len(coding_bytes)} bytes from Central Electric (0x09).")

            # 7. Mandatory Zero-Touch SQLite Backup
            backup = safety.execute_prewrite_backup(
                vin=vin,
                module_address=0x09,
                did=DID_BCM_LONG_CODING,
                original_payload=coding_bytes,
            )
            console.print(
                f"[bold green]✓ Immutable Snapshot Stored:[/bold green] Backup ID [bold cyan]#{backup.id}[/bold cyan] "
                f"saved at [dim]{backup.timestamp}[/dim] in SQLite DB."
            )

            # 8. Display Raw Hex String & Formatted Dump
            raw_hex = coding_bytes.hex().upper()
            console.print(
                Panel(
                    f"[bold white]{raw_hex}[/bold white]\n\n[dim]{format_hex_dump(coding_bytes)}[/dim]",
                    title=f"[bold]Central Electric (0x09) Long Coding [{len(coding_bytes)} Bytes][/bold]",
                    border_style="green",
                )
            )

            # 9. Decode Features if Schema is Available
            if bcm_schema:
                feature_states = bcm_schema.evaluate_features(coding_bytes)
                table = Table(title="Decoded Vehicle Features (PQ25 Schema)", border_style="dim")
                table.add_column("Category", style="cyan")
                table.add_column("Feature Name", style="bold white")
                table.add_column("Coord", style="dim")
                table.add_column("State", justify="center")

                for feature in bcm_schema.features:
                    is_active = feature_states.get(feature.id, False)
                    status_str = "[bold green]ENABLED[/bold green]" if is_active else "[dim]DISABLED[/dim]"
                    coord_str = f"B{feature.byte}:b{feature.bit}"
                    table.add_row(feature.category, feature.name, coord_str, status_str)

                console.print(table)

        console.print("[bold green]Diagnostic session terminated safely. ECU reset to default session (0x10 0x01).[/bold green]")
        return 0

    except Exception as e:
        console.print(f"[bold red]Execution error:[/bold red] {e}")
        return 1
    finally:
        await transport.disconnect()


def main():
    parser = argparse.ArgumentParser(
        description="OpenTransporter BCM Long Coding Dump & Safety Snapshot Tool"
    )
    parser.add_argument(
        "--mac",
        type=str,
        default=None,
        help="Bluetooth MAC address of the BLE OBD-II adapter (e.g. AA:BB:CC:11:22:33)",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Run against high-fidelity simulated vLinker adapter & Transporter ECU testbench",
    )
    parser.add_argument(
        "--rpm",
        type=int,
        default=0,
        help="Simulated engine RPM for mock testing (default: 0 = Engine OFF)",
    )

    args = parser.parse_args()
    ret = asyncio.run(dump_bcm_workflow(mac=args.mac, mock=args.mock, mock_rpm=args.rpm))
    sys.exit(ret)


if __name__ == "__main__":
    main()
