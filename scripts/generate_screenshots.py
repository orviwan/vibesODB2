#!/usr/bin/env python3
"""
Automated Screenshot Capture Engine for vibesODB2 via Chrome DevTools Protocol (CDP).
Captures high-resolution, pixel-perfect screenshots of:
- Virtual Cockpit
- Schema-Driven Feature Coding (23 features, categories, active/disabled filters)
- Interactive Byte Matrix
- Service & Maintenance Tools (SRI, Battery Registration, EPB, Mileage)
- Diagnostic Trouble Codes (DTCs) Scanner
- Safety Audit Guardrail Modal
- Terminal Live Telemetry HUD
"""

import asyncio
import base64
import functools
import http.server
import json
import os
import shutil
import subprocess
import threading
import time
import urllib.request
from pathlib import Path

import websockets

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PWA_DIR = PROJECT_ROOT / "pwa"
OUTPUT_DIR = PROJECT_ROOT / "docs" / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

CHROME_BIN = shutil.which("google-chrome") or "/usr/local/bin/google-chrome"


async def send_cdp(ws, msg_id: int, method: str, params: dict = None):
    payload = {"id": msg_id, "method": method}
    if params:
        payload["params"] = params
    await ws.send(json.dumps(payload))
    while True:
        raw = await ws.recv()
        data = json.loads(raw)
        if data.get("id") == msg_id:
            return data


async def capture_cdp_screens(port: int = 8139):
    cdp_port = 9255
    chrome_proc = subprocess.Popen([
        CHROME_BIN,
        "--headless=new",
        f"--remote-debugging-port={cdp_port}",
        "--no-sandbox",
        "--disable-gpu",
        "--window-size=430,932"
    ])
    await asyncio.sleep(1.5)

    try:
        req = urllib.request.urlopen(f"http://127.0.0.1:{cdp_port}/json")
        tabs = json.loads(req.read().decode("utf-8"))
        page_tab = [t for t in tabs if t.get("type") == "page"][0]
        ws_url = page_tab["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url) as ws:
            msg_id = 1
            await send_cdp(ws, msg_id, "Page.enable")
            msg_id += 1

            # -------------------------------------------------------------
            # 1. MOBILE CAPTURES (430 x 932)
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Emulation.setDeviceMetricsOverride", {
                "width": 430,
                "height": 932,
                "deviceScaleFactor": 2,
                "mobile": True
            })
            msg_id += 1

            # Navigate to local PWA server
            await send_cdp(ws, msg_id, "Page.navigate", {"url": f"http://127.0.0.1:{port}/index.html"})
            msg_id += 1
            await asyncio.sleep(1.5)

            # A. Cockpit
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-cockpit', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_cockpit = OUTPUT_DIR / "pwa_mobile_cockpit.png"
            out_cockpit.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_cockpit.name} ({os.path.getsize(out_cockpit):,} bytes)")

            # B. Feature Coding
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-coding', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_coding = OUTPUT_DIR / "pwa_mobile_coding.png"
            out_coding.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_coding.name} ({os.path.getsize(out_coding):,} bytes)")

            # C. Service & Maintenance
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-service', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_service = OUTPUT_DIR / "pwa_mobile_service.png"
            out_service.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_service.name} ({os.path.getsize(out_service):,} bytes)")

            # D. Byte Matrix
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-matrix', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_matrix = OUTPUT_DIR / "pwa_mobile_matrix.png"
            out_matrix.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_matrix.name} ({os.path.getsize(out_matrix):,} bytes)")

            # E. Fault Codes (DTCs)
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-dtcs', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_dtcs = OUTPUT_DIR / "pwa_mobile_dtcs.png"
            out_dtcs.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_dtcs.name} ({os.path.getsize(out_dtcs):,} bytes)")

            # F. Safety Audit Modal (Mobile)
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.promptSafetyAudit({ featureName: 'Scandinavian DRL', modifiedBytes: new Uint8Array([0x30, 0xA0, 0x05, 0x00, 0x40, 0x80, 0x00, 0x00, 0x00, 0x01, 0x03, 0x04, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) })"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_modal = OUTPUT_DIR / "pwa_mobile_safety_modal.png"
            out_modal.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_modal.name} ({os.path.getsize(out_modal):,} bytes)")

            # -------------------------------------------------------------
            # 2. DESKTOP CAPTURES (1300 x 850)
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Emulation.setDeviceMetricsOverride", {
                "width": 1300,
                "height": 850,
                "deviceScaleFactor": 1,
                "mobile": False
            })
            msg_id += 1

            # Desktop Cockpit
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-cockpit', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_d_telemetry = OUTPUT_DIR / "vibesodb2_telemetry.png"
            out_d_telemetry.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_d_telemetry.name} ({os.path.getsize(out_d_telemetry):,} bytes)")

            # Desktop Feature Coding
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-coding', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_d_features = OUTPUT_DIR / "vibesodb2_features.png"
            out_d_features.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_d_features.name} ({os.path.getsize(out_d_features):,} bytes)")

            # Desktop Byte Matrix
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-matrix', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_d_matrix = OUTPUT_DIR / "vibesodb2_byte_matrix.png"
            out_d_matrix.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_d_matrix.name} ({os.path.getsize(out_d_matrix):,} bytes)")

            # Desktop Backups
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-backups', false)"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_d_backups = OUTPUT_DIR / "vibesodb2_backups.png"
            out_d_backups.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_d_backups.name} ({os.path.getsize(out_d_backups):,} bytes)")

            # Desktop Safety Modal
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.promptSafetyAudit({ featureName: 'Scandinavian DRL', modifiedBytes: new Uint8Array([0x30, 0xA0, 0x05, 0x00, 0x40, 0x80, 0x00, 0x00, 0x00, 0x01, 0x03, 0x04, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) })"})
            msg_id += 1
            await asyncio.sleep(0.4)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_d_modal = OUTPUT_DIR / "vibesodb2_safety_modal.png"
            out_d_modal.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_d_modal.name} ({os.path.getsize(out_d_modal):,} bytes)")

    finally:
        chrome_proc.terminate()


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
        time.sleep(0.8)
        asyncio.run(capture_cdp_screens(port))
        generate_terminal_hud_screenshot(OUTPUT_DIR / "vibesodb2_terminal_hud.png")
        print("\nAll mobile and desktop screenshots successfully captured via CDP!")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()

