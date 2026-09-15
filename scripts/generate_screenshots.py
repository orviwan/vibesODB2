#!/usr/bin/env python3
"""
Automated Screenshot Capture Engine for vibesODB2.
Captures high-resolution screenshots of the PWA Virtual Cockpit, Feature Coding,
Interactive Byte Matrix, Safety Audit Guardrail Modal, Backups,
and the Terminal Live Telemetry HUD.
"""

import functools
import http.server
import os
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
PWA_DIR = PROJECT_ROOT / "pwa"
OUTPUT_DIR = PROJECT_ROOT / "docs" / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CHROME_BIN = shutil.which("google-chrome") or "/usr/local/bin/google-chrome"


def capture_url(url: str, output_path: Path, wait_ms: int = 2500, width: int = 1400, height: int = 920):
    cmd = [
        CHROME_BIN,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        f"--window-size={width},{height}",
        f"--virtual-time-budget={wait_ms}",
        f"--screenshot={output_path}",
        url,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"✓ Captured: {output_path.name} ({os.path.getsize(output_path):,} bytes)")


def generate_terminal_hud_screenshot(output_path: Path):
    from rich.console import Console
    from rich.panel import Panel

    console = Console(record=True, width=90)

    spd = 84
    mph = spd * 0.621371
    rpm = 3450
    gear_str = "Gear 3"
    boost = 1.25
    coolant = 89.5
    iat = 28.0
    fuel = 1380.0
    throttle = 65.0
    egt = 485.0
    soot = 14.82
    hz = 38.4
    lat = 26.2
    pkts = 1842

    rpm_ratio = min(1.0, max(0.0, rpm / 6000.0))
    filled = int(rpm_ratio * 30)
    rpm_color = "yellow"
    rpm_bar = f"[{rpm_color}]{'█' * filled}[/{rpm_color}]{'░' * (30 - filled)}"

    boost_ratio = min(1.0, max(0.0, boost / 2.0))
    b_filled = int(boost_ratio * 20)
    boost_color = "cyan"
    boost_bar = f"[{boost_color}]{'█' * b_filled}[/{boost_color}]{'░' * (20 - b_filled)}"

    content = f"""
 [bold cyan]SPEED:[/bold cyan]  [bold white]{int(spd):3d}[/bold white] km/h  [dim]({mph:4.1f} mph)[/dim]          [bold magenta]GEAR:[/bold magenta] [bold white]{gear_str}[/bold white]   [bold yellow]THROTTLE:[/bold yellow] [bold white]{throttle:4.1f}%[/bold white]
 [bold cyan]RPM:  [/bold cyan]  {rpm_bar}  [bold white]{int(rpm):4d}[/bold white] RPM
 [bold cyan]BOOST:[/bold cyan]  {boost_bar}  [bold white]{boost:4.2f}[/bold white] bar

 ────────────────────────────────────────────────────────────────────────
  [dim]Coolant Temp:[/dim] [bold]{coolant:4.1f} °C[/bold]     [dim]Intake Air:[/dim]  [bold]{iat:4.1f} °C[/bold]     [dim]Fuel Rail:[/dim] [bold]{fuel:6.1f} bar[/bold]
  [dim]DPF Soot:    [/dim] [bold]{soot:4.2f} g[/bold]      [dim]Turbo EGT: [/dim] [bold]{egt:4.1f} °C[/bold]     [dim]Voltage:  [/dim] [bold]12.6V[/bold]
 ────────────────────────────────────────────────────────────────────────
  [dim]Telemetry Loop:[/dim] [bold green]{hz:4.1f} Hz[/bold green] | [dim]Latency:[/dim] [bold]{lat:4.1f} ms[/bold] | [dim]Packets:[/dim] [bold]{pkts}[/bold] | [dim yellow]Ctrl+C to stop[/dim yellow]
"""
    panel = Panel(
        content.strip(),
        title="[bold cyan]🏎️ vibesODB2 Live Telemetry Dashboard HUD[/bold cyan]",
        border_style="cyan",
    )
    console.print()
    console.print(panel)
    console.print()

    html_str = console.export_html(inline_styles=True)
    styled_html = f"""<!DOCTYPE html>
<html>
<head>
<style>
body {{
    background-color: #0b0f19;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
    font-family: monospace;
}}
pre {{
    background-color: #070a12;
    padding: 2.5rem;
    border-radius: 12px;
    border: 1px solid #1e293b;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    font-size: 1.15rem;
    line-height: 1.45;
}}
</style>
</head>
<body>
{html_str}
</body>
</html>"""
    temp_html = PROJECT_ROOT / "docs" / "images" / "temp_terminal.html"
    temp_html.write_text(styled_html, encoding="utf-8")

    cmd = [
        CHROME_BIN,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--window-size=1100,560",
        "--virtual-time-budget=1000",
        f"--screenshot={output_path}",
        f"file://{temp_html.resolve()}",
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if temp_html.exists():
        temp_html.unlink()
    print(f"✓ Captured: {output_path.name} ({os.path.getsize(output_path):,} bytes)")


def main():
    print("Launching local PWA HTTP server for screenshot capture...")
    port = 8139
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(PWA_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        time.sleep(1.0)
        base_url = f"http://127.0.0.1:{port}"

        # 1. Cockpit
        img_cockpit = OUTPUT_DIR / "pwa_mobile_cockpit.png"
        capture_url(f"{base_url}/index.html", img_cockpit, wait_ms=2500, width=420, height=900)

        # 2. Terminal Cockpit HUD
        img_hud = OUTPUT_DIR / "vibesodb2_terminal_hud.png"
        generate_terminal_hud_screenshot(img_hud)

        print("\nScreenshots updated successfully!")

    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
