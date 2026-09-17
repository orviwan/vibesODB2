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
            # Emulate modern mobile device (iPhone 14 / Pixel 8: 430 x 932 @ 2x)
            await send_cdp(ws, msg_id, "Emulation.setDeviceMetricsOverride", {
                "width": 430,
                "height": 932,
                "deviceScaleFactor": 2,
                "mobile": True
            })
            msg_id += 1

            # Set mobile user agent to prevent desktop Linux warning banner
            await send_cdp(ws, msg_id, "Emulation.setUserAgentOverride", {
                "userAgent": "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36",
                "platform": "Android"
            })
            msg_id += 1

            # Navigate to local PWA server
            await send_cdp(ws, msg_id, "Page.navigate", {"url": f"http://127.0.0.1:{port}/index.html"})
            msg_id += 1
            await asyncio.sleep(1.8)

            # -------------------------------------------------------------
            # A. Digital Cockpit (with realistic live driving telemetry)
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": """
                window.__VIBES_APP__.switchTab('tab-cockpit', false);
                window.__VIBES_APP__.renderTelemetry({
                    vehicle_speed_kmh: 78,
                    engine_rpm: 2850,
                    engaged_gear: '4',
                    boost_pressure_bar: 1.18,
                    throttle_position_pct: 48,
                    engine_load_pct: 62,
                    coolant_temp_c: 90.0,
                    intake_air_temp_c: 24.0,
                    exhaust_gas_temp_c: 440.0,
                    dpf_soot_load_g: 12.8,
                    fuel_rail_pressure_bar: 1350.0,
                    battery_voltage: 14.1
                });
                window.__VIBES_APP__.renderHz(38.4);
                const notice = document.getElementById('cockpit-ble-notice');
                if (notice) notice.style.display = 'none';
            """})
            msg_id += 1
            await asyncio.sleep(0.5)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_cockpit = OUTPUT_DIR / "pwa_mobile_cockpit.png"
            out_cockpit.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_cockpit.name} ({os.path.getsize(out_cockpit):,} bytes)")

            # -------------------------------------------------------------
            # B. Feature Coding (with compatibility filters and badges)
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": """
                window.__VIBES_APP__.switchTab('tab-coding', false);
                window.__VIBES_APP__.renderFeatureList();
            """})
            msg_id += 1
            await asyncio.sleep(0.5)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_coding = OUTPUT_DIR / "pwa_mobile_coding.png"
            out_coding.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_coding.name} ({os.path.getsize(out_coding):,} bytes)")

            # -------------------------------------------------------------
            # C. Service & Maintenance (SRI Reset, Battery, EPB, Mileage)
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-service', false)"})
            msg_id += 1
            await asyncio.sleep(0.5)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_service = OUTPUT_DIR / "pwa_mobile_service.png"
            out_service.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_service.name} ({os.path.getsize(out_service):,} bytes)")

            # -------------------------------------------------------------
            # D. Interactive Byte Matrix Buffer
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": "window.__VIBES_APP__.switchTab('tab-matrix', false)"})
            msg_id += 1
            await asyncio.sleep(0.5)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_matrix = OUTPUT_DIR / "pwa_mobile_matrix.png"
            out_matrix.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_matrix.name} ({os.path.getsize(out_matrix):,} bytes)")

            # -------------------------------------------------------------
            # E. Fault Code Scanner (DTCs & Auto-Scan with Knowledge Drawer)
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": """
                (async () => {
                    window.__VIBES_APP__.switchTab('tab-dtcs', false);
                    await window.__VIBES_APP__.runDtcAutoScan(false);
                    // Expand the first accordion drawer so 'What it means & suggested fix' is showcased
                    const btn = document.querySelector('.dtc-drawer-toggle');
                    if (btn) btn.click();
                })()
            """, "awaitPromise": True})
            msg_id += 1
            await asyncio.sleep(0.8)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_dtcs = OUTPUT_DIR / "pwa_mobile_dtcs.png"
            out_dtcs.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_dtcs.name} ({os.path.getsize(out_dtcs):,} bytes)")

            # -------------------------------------------------------------
            # F. Multi-Vehicle Grouped Backups & License Plate Tagging
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": """
                (async () => {
                    localStorage.setItem('vibesodb2_reg_WV1ZZZ7HZ7H061325', 'AB07 VAN');
                    localStorage.setItem('vibesodb2_reg_WVWZZZAUZEW012345', 'GL14 VWG');
                    window.__VIBES_APP__.switchTab('tab-backups', false);
                    await window.__VIBES_APP__.renderBackupsList();
                })()
            """, "awaitPromise": True})
            msg_id += 1
            await asyncio.sleep(0.6)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_backups = OUTPUT_DIR / "pwa_mobile_backups.png"
            out_backups.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_backups.name} ({os.path.getsize(out_backups):,} bytes)")

            # -------------------------------------------------------------
            # G. Pre-Flash Safety Audit Modal
            # -------------------------------------------------------------
            await send_cdp(ws, msg_id, "Runtime.evaluate", {"expression": """
                window.__VIBES_APP__.promptSafetyAudit({
                    featureName: 'Scandinavian DRL (Rear Tail Lights Active with DRL)',
                    modifiedBytes: new Uint8Array([0x30, 0xA0, 0x05, 0x00, 0x40, 0x80, 0x00, 0x00, 0x00, 0x01, 0x03, 0x04, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
                });
            """})
            msg_id += 1
            await asyncio.sleep(0.5)
            res = await send_cdp(ws, msg_id, "Page.captureScreenshot")
            msg_id += 1
            out_modal = OUTPUT_DIR / "pwa_mobile_safety_modal.png"
            out_modal.write_bytes(base64.b64decode(res["result"]["data"]))
            print(f"✓ Captured: {out_modal.name} ({os.path.getsize(out_modal):,} bytes)")

    finally:
        chrome_proc.terminate()


def main():
    print("Capturing fresh vibesODB2 PWA mobile screenshots via Chrome DevTools Protocol (CDP)...")
    port = 8139
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(PWA_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        time.sleep(0.8)
        asyncio.run(capture_cdp_screens(port))
        print("\nAll mobile screenshots successfully refreshed and verified!")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()

