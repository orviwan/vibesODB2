"""
Tests for the OpenTransporter Web API endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from vibesodb2.web.app import app


@pytest.fixture
def client():
    return TestClient(app)


def test_web_status_endpoint(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert "mock_mode" in data
    assert data["engine_off_safe"] is True


def test_web_modules_endpoint(client):
    res = client.get("/api/modules")
    assert res.status_code == 200
    modules = res.json()
    assert len(modules) >= 5
    # Central Electric must be present
    bcm = next(m for m in modules if m["address"] == "0x09")
    assert bcm["name"] == "Central Electric (BCM)"
    assert bcm["is_blacklisted"] is False


def test_web_coding_and_feature_write(client):
    # Read coding
    res = client.get("/api/module/0x09/coding")
    assert res.status_code == 200
    coding_data = res.json()
    assert coding_data["byte_length"] == 30
    assert len(coding_data["features"]) >= 5

    # Write feature
    res_write = client.post(
        "/api/module/write_feature",
        json={
            "module_address": "0x09",
            "feature_id": "auto_lock_15kmh",
            "enabled": True,
        },
    )
    assert res_write.status_code == 200
    write_res = res_write.json()
    assert write_res["status"] in ["success", "no_change"]
    if write_res["status"] == "success":
        assert "backup_id" in write_res


def test_web_backups_list(client):
    res = client.get("/api/backups")
    assert res.status_code == 200
    backups = res.json()
    assert isinstance(backups, list)


def test_web_dtc_endpoints(client):
    res = client.get("/api/module/0x09/dtcs")
    assert res.status_code == 200
    data = res.json()
    assert "dtcs" in data

    res_clear = client.post("/api/module/0x09/dtcs/clear")
    assert res_clear.status_code == 200
    assert res_clear.json()["status"] == "cleared"


def test_web_static_html(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "vibesODB2" in res.text
    assert "Dynamic Feature Coding" in res.text
    assert "Real-Time Telemetry" in res.text
    assert "Discovered BLE OBD Adapters" in res.text


def test_web_scan_endpoint(client, monkeypatch):
    from vibesodb2.ble.discovery import DiscoveredAdapter

    async def mock_scan(timeout=4.0, include_all=False):
        return [
            DiscoveredAdapter(
                name="vLinker MC-IOS",
                address="C0:25:E8:59:B4:D5",
                rssi=-75,
                is_recommended=True,
                details="Services: 1, NUS: True",
                is_obd=True,
            )
        ]

    import sys
    web_module = sys.modules["vibesodb2.web.app"]
    monkeypatch.setattr(web_module, "scan_for_adapters", mock_scan)
    res = client.get("/api/scan?all_devices=true")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["name"] == "vLinker MC-IOS"
    assert data[0]["is_recommended"] is True
    assert data[0]["is_obd"] is True


def test_web_connect_mock_mode(client):
    res = client.post("/api/connect", json={"mock": True, "mock_rpm": 0})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "connected"
def test_web_connect_failure_details(client, monkeypatch):
    from vibesodb2.ble.transport import BleNordicUartTransport

    async def mock_connect_fail(self):
        raise TimeoutError("Device unreachable")

    monkeypatch.setattr(BleNordicUartTransport, "connect", mock_connect_fail)
    res = client.post("/api/connect", json={"mock": False, "mac": "AA:BB:CC:DD:EE:FF"})
    assert res.status_code == 400
    data = res.json()
    assert "Connection timed out" in data["detail"]


def test_web_disconnect(client):
    # First ensure connected
    client.post("/api/connect", json={"mock": True, "mock_rpm": 0})
    res = client.post("/api/disconnect")
    assert res.status_code == 200
    assert res.json()["status"] == "disconnected"
    status_res = client.get("/api/status")
    assert status_res.json()["connected"] is False


def test_web_connect_concurrency_lock(client):
    from vibesodb2.web.app import state

    # Simulate an active connection attempt in progress
    state.is_connecting = True
    try:
        res = client.post("/api/connect", json={"mock": True, "mock_rpm": 0})
        assert res.status_code == 409
        assert "already in progress" in res.json()["detail"]
    finally:
        state.is_connecting = False


def test_web_html_controls(client):
    res = client.get("/")
    assert res.status_code == 200
    html = res.text
    assert "btnModalScan" in html
    assert "btnStartSimulator" in html
    assert "modalBusyBox" in html
    assert "modalErrorBox" in html
    assert "tabBtnBle" in html
    assert "tabBtnMock" in html
    assert "btnHeaderConnect" in html


