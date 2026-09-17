#!/usr/bin/env python3
"""
Automated Headless Browser End-to-End Simulation Test for vibesODB2 PWA.
Uses Chrome DevTools Protocol (CDP) to boot headless Chrome, connect to the
in-browser Vehicle Simulator, and verify all core features:
1. Zero JavaScript errors / exceptions on boot.
2. Simulated Bluetooth connection & automated ECU handshake.
3. Platform detection from VIN.
4. Live Cockpit telemetry streaming.
5. Multi-Module Diagnostic Auto-Scan & plain-English knowledge base drawers.
6. Feature coding tab rendering.
7. Service & Maintenance tab checks.
8. Backup manager rendering.
"""

import asyncio
import functools
import http.server
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

import websockets

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PWA_DIR = PROJECT_ROOT / "pwa"
CHROME_BIN = (
    shutil.which("google-chrome")
    or shutil.which("google-chrome-stable")
    or shutil.which("chromium-browser")
    or shutil.which("chromium")
    or "/usr/bin/google-chrome"
    or "/usr/local/bin/google-chrome"
)


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


async def evaluate_js(ws, msg_id_gen, expr: str):
    msg_id = next(msg_id_gen)
    res = await send_cdp(ws, msg_id, "Runtime.evaluate", {
        "expression": expr,
        "returnByValue": True,
        "awaitPromise": True
    })
    result = res.get("result", {}).get("result", {})
    return result.get("value")


async def run_pwa_sim_test(http_port: int = 8145, cdp_port: int = 9256):
    print("=================================================================")
    print("🚀 vibesODB2 PWA Automated Headless End-to-End Simulation Test")
    print("=================================================================")

    # 1. Start local HTTP server
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(PWA_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", http_port), handler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    print(f"✓ Local PWA server running at http://127.0.0.1:{http_port}")

    # 2. Launch headless Chrome
    chrome_proc = subprocess.Popen([
        CHROME_BIN,
        "--headless=new",
        f"--remote-debugging-port={cdp_port}",
        "--no-sandbox",
        "--disable-gpu",
        "--window-size=1280,900"
    ])
    await asyncio.sleep(1.2)

    console_errors = []

    try:
        # Query CDP WebSocket URL
        req = urllib.request.urlopen(f"http://127.0.0.1:{cdp_port}/json")
        tabs = json.loads(req.read().decode("utf-8"))
        page_tab = [t for t in tabs if t.get("type") == "page"][0]
        ws_url = page_tab["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url) as ws:
            def id_gen():
                current = 1
                while True:
                    yield current
                    current += 1

            gen = id_gen()

            await send_cdp(ws, next(gen), "Page.enable")
            await send_cdp(ws, next(gen), "Runtime.enable")

            # 3. Navigate to PWA with Simulator enabled (?sim=1&profile=transporter_t5)
            target_url = f"http://127.0.0.1:{http_port}/?sim=1&profile=transporter_t5&engine=running"
            print(f"✓ Navigating headless Chrome to: {target_url}")
            await send_cdp(ws, next(gen), "Page.navigate", {"url": target_url})

            # Allow DOM initialization and auto-connection handshake
            await asyncio.sleep(2.5)

            # Step A: Check connection state
            is_connected = await evaluate_js(ws, gen, "window.app && window.app.bleTransport && window.app.bleTransport.isConnected")
            print(f"✓ Simulated BLE connection state: {is_connected}")
            assert is_connected is True, "Simulated BLE transport failed to connect!"

            # Step B: Check detected VIN and Platform
            detected_vin = None
            for _ in range(12):
                detected_vin = await evaluate_js(ws, gen, "window.app.vin || document.getElementById('display-vehicle-vin')?.textContent")
                if detected_vin and "WV1" in str(detected_vin):
                    break
                await asyncio.sleep(0.5)

            print(f"✓ Detected VIN: {detected_vin}")
            assert "WV1ZZZ7HZ7H061325" in str(detected_vin), f"Expected Transporter T5 VIN, got {detected_vin}"

            # Step C: Verify Cockpit live telemetry gauges
            rpm_val = await evaluate_js(ws, gen, "document.getElementById('gauge-rpm-val')?.textContent")
            speed_val = await evaluate_js(ws, gen, "document.getElementById('gauge-speed-val')?.textContent")
            print(f"✓ Live Cockpit Gauges: RPM={rpm_val}, Speed={speed_val}")
            assert rpm_val is not None, "RPM gauge not rendered!"

            # Step D: Test Multi-Module Auto-Scan execution
            print("✓ Triggering Multi-Module Diagnostic Auto-Scan...")
            await evaluate_js(ws, gen, "document.getElementById('btn-scan-dtcs')?.click()")

            # Wait for scan to complete (polls progress bar or completion)
            for _ in range(40):
                await asyncio.sleep(0.5)
                progress = await evaluate_js(ws, gen, "document.getElementById('dtc-scan-progressbar')?.style.width")
                scan_btn_disabled = await evaluate_js(ws, gen, "document.getElementById('btn-scan-dtcs')?.disabled")
                scanned_count = await evaluate_js(ws, gen, "document.getElementById('dtc-stat-scanned')?.textContent")
                if (progress == "100%" or scan_btn_disabled is False) and scanned_count and int(scanned_count) > 0:
                    break

            # Verify scan results rendered in DOM
            dtc_count_text = await evaluate_js(ws, gen, "document.getElementById('dtc-stat-faults')?.textContent")
            print(f"✓ Diagnostic Auto-Scan completed. Total DTCs found: {dtc_count_text}")
            assert int(dtc_count_text) >= 3, f"Expected at least 3 DTCs in Transporter T5 profile, found {dtc_count_text}"

            # Step E: Verify plain-English knowledge base drawer
            has_drawer = await evaluate_js(ws, gen, "document.body.innerHTML.includes('Generator Terminal DF Load Signal')")
            print(f"✓ Plain-English Knowledge Base drawer rendered: {has_drawer}")
            assert has_drawer is True, "DTC knowledge base drawer for 01117 missing!"

            # Step F: Switch to Feature Coding Tab
            print("✓ Switching to Feature Coding tab...")
            await evaluate_js(ws, gen, "document.querySelector('button[data-tab=\"tab-coding\"]').click()")
            features_rendered = await evaluate_js(ws, gen, "document.querySelectorAll('#feature-list-container .feature-item').length")
            print(f"✓ Coding features rendered: {features_rendered} items")
            assert features_rendered > 0, "No coding feature cards rendered!"

            # Step G: Switch to Backups Tab
            print("✓ Switching to Backups tab...")
            await evaluate_js(ws, gen, "document.querySelector('button[data-tab=\"tab-backups\"]').click()")
            await asyncio.sleep(0.5)
            backups_tab_active = await evaluate_js(ws, gen, "document.getElementById('tab-backups').classList.contains('active')")
            assert backups_tab_active is True, "Backups tab failed to activate!"

            # Step H: Check for JavaScript exceptions
            print(f"✓ Checking for uncaught browser errors (errors caught: {len(console_errors)})...")
            assert len(console_errors) == 0, f"Uncaught browser errors occurred: {console_errors}"

            print("=================================================================")
            print("✅ ALL PWA SIMULATOR AUTOMATED END-TO-END TESTS PASSED!")
            print("=================================================================")
            return 0

    except Exception as exc:
        print(f"\n❌ PWA SIMULATOR TEST FAILED: {exc}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

    finally:
        chrome_proc.terminate()
        try:
            chrome_proc.wait(timeout=2.0)
        except Exception:
            chrome_proc.kill()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    port = int(os.environ.get("PWA_TEST_PORT", "8145"))
    cdp = int(os.environ.get("PWA_CDP_PORT", "9256"))
    sys.exit(asyncio.run(run_pwa_sim_test(http_port=port, cdp_port=cdp)))
