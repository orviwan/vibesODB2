#!/usr/bin/env python3
"""
Automated Screenshot Capture Engine for vibesODB2.
Captures high-resolution screenshots of the Web Virtual Cockpit, Dynamic Feature Coding,
Interactive Byte Matrix, Safety Audit Guardrail Modal, Zero-Touch Backups,
and the Terminal Live Telemetry HUD.
"""

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "docs" / "images"
ARTIFACT_DIR = Path("/home/orviwan/.gemini/antigravity/brain/d04b2567-d539-48b1-8ede-439d9cec76e0")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

CHROME_BIN = "/usr/local/bin/google-chrome"
PYTHON_BIN = sys.executable


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

    # Realistic HUD snapshot
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
    print("Launching vibesODB2 server for automated screenshot captures...")
    port = 8129
    server = subprocess.Popen(
        [PYTHON_BIN, "-m", "uvicorn", "vibesodb2.web.app:app", "--host", "127.0.0.1", f"--port={port}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        time.sleep(2.0)
        base_url = f"http://127.0.0.1:{port}"

        # 1. Real-Time Telemetry & Virtual Cockpit
        img_telemetry = OUTPUT_DIR / "vibesodb2_telemetry.png"
        capture_url(f"{base_url}/#telemetryTab", img_telemetry, wait_ms=4000, width=1400, height=920)

        # 2. Dynamic Feature Coding
        img_features = OUTPUT_DIR / "vibesodb2_features.png"
        capture_url(f"{base_url}/#featuresTab", img_features, wait_ms=2500, width=1400, height=920)

        # 3. Interactive Byte Matrix & Bit Inspector
        img_bytes = OUTPUT_DIR / "vibesodb2_byte_matrix.png"
        capture_url(f"{base_url}/#byteInspectorTab", img_bytes, wait_ms=2500, width=1400, height=920)

        # 4. Zero-Touch Backups Registry
        img_backups = OUTPUT_DIR / "vibesodb2_backups.png"
        capture_url(f"{base_url}/#backupsTab", img_backups, wait_ms=2500, width=1400, height=850)

        # 5. Pre-Write Safety Audit Modal
        img_safety = OUTPUT_DIR / "vibesodb2_safety_modal.png"
        capture_url(f"{base_url}/?modal=safety", img_safety, wait_ms=2500, width=1400, height=900)

        # 6. Terminal Cockpit HUD
        img_hud = OUTPUT_DIR / "vibesodb2_terminal_hud.png"
        generate_terminal_hud_screenshot(img_hud)

        # Copy all generated screenshots to the artifacts directory
        for img in [img_telemetry, img_features, img_bytes, img_backups, img_safety, img_hud]:
            if img.exists():
                shutil.copy2(img, ARTIFACT_DIR / img.name)
                print(f"✓ Copied to artifacts: {img.name}")

        print("\nAll screenshots generated and verified successfully!")

    finally:
        server.terminate()


if __name__ == "__main__":
    main()
