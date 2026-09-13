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
