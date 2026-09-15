"""
FastAPI Backend Web Application for OpenTransporter Web Dashboard.
Provides REST APIs for BLE/Mock transport, Long Coding reading/writing,
safety audits, backups, DTC management, and VAG platform switching (PQ25, PQ35, MQB).
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

# Configure vibesodb2 root logger to ensure logs are visible in the terminal
logger = logging.getLogger("vibesodb2.web")
_root_logger = logging.getLogger("vibesodb2")
_root_logger.setLevel(logging.INFO)
if not any(isinstance(h, logging.StreamHandler) for h in _root_logger.handlers):
    _ch = logging.StreamHandler()
    _ch.setLevel(logging.INFO)
    _ch.setFormatter(
        logging.Formatter("%(asctime)s [%(levelname)s] [%(name)s] %(message)s", datefmt="%H:%M:%S")
    )
    _root_logger.addHandler(_ch)

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from vibesodb2.adapter.elm327 import ELM327Adapter, MODULE_REGISTRY
from vibesodb2.ble.discovery import scan_for_adapters
from vibesodb2.ble.mock_transport import MockTransport
from vibesodb2.ble.transport import BleNordicUartTransport, Transport
from vibesodb2.safety.bitwise import compute_byte_diff, get_bit, set_bit
from vibesodb2.telemetry.engine import TelemetryEngine
from vibesodb2.safety.guardrails import (
    BLACKLISTED_MODULES,
    SafetyEngine,
    EngineRunningInterlockError,
    BlacklistedModuleError,
)
from vibesodb2.safety.storage import StorageManager
from vibesodb2.schema.loader import SchemaLoader
from vibesodb2.schema.models import VehicleFeature
from vibesodb2.schema.platforms import (
    CHASSIS_CATALOG,
    detect_platform_from_vin,
    get_supported_platforms,
)
from vibesodb2.uds.client import UDSClient
from vibesodb2.uds.constants import DID_VIN

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(
    title="vibesODB2 Diagnostic & Configuration Engine",
    description="REST API for VAG (PQ25 / PQ35 / MQB) UDS Long Coding & Live Telemetry",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global State
class AppState:
    def __init__(self):
        self.mock_mode: bool = os.getenv("VIBESODB2_MOCK", os.getenv("OPENTRANSPORTER_MOCK", "1")) == "1"
        self.ble_mac: Optional[str] = os.getenv("VIBESODB2_MAC", os.getenv("OPENTRANSPORTER_MAC", None))
        self.platform: str = os.getenv("VIBESODB2_PLATFORM", os.getenv("OPENTRANSPORTER_PLATFORM", "PQ25"))
        self.transport: Optional[Transport] = None
        self.adapter: Optional[ELM327Adapter] = None
        self.safety = SafetyEngine()
        self.storage = StorageManager()
        self.schema_loader = SchemaLoader(self.storage)
        self.connected: bool = False
        self.voltage: str = "12.6V"
        self.last_rpm: int = 0
        self.active_module: int = 0x09
        self.cached_coding: Dict[int, bytearray] = {}
        self.vin: str = "WV1ZZZ7EZEH012345"
        self.telemetry_engine: Optional[TelemetryEngine] = None
        self._connect_lock: Optional[asyncio.Lock] = None
        self.is_connecting: bool = False

    @property
    def connect_lock(self) -> asyncio.Lock:
        if self._connect_lock is None:
            self._connect_lock = asyncio.Lock()
        return self._connect_lock

    async def get_or_create_adapter(self) -> ELM327Adapter:
        if self.adapter and self.transport and self.transport.is_connected:
            return self.adapter

        if self.mock_mode:
            logger.info("Initializing MockTransport (simulated engine_rpm=%d)...", self.last_rpm)
            self.transport = MockTransport(engine_rpm=self.last_rpm)
        else:
            target = self.ble_mac or "auto"
            logger.info("Initializing BleNordicUartTransport for target: %s", target)
            self.transport = BleNordicUartTransport(target)

        try:
            logger.info("Connecting transport...")
            await self.transport.connect()
            if hasattr(self.transport, "mac_or_uuid") and self.transport.mac_or_uuid:
                self.ble_mac = self.transport.mac_or_uuid
                logger.info("Transport connected to: %s", self.ble_mac)

            logger.info("Initializing ELM327 adapter protocol (ATZ, ATE0, etc.)...")
            self.adapter = ELM327Adapter(self.transport)
            await self.adapter.initialize()
            self.connected = True
            self.voltage = self.adapter.voltage or "12.6V"
            logger.info("Adapter initialized. Voltage: %s, Device: %s", self.voltage, self.adapter.device_version)
            return self.adapter
        except Exception as e:
            logger.error("Failed to initialize adapter on %s: %s", self.ble_mac or "auto", e, exc_info=True)
            if self.transport:
                try:
                    await self.transport.disconnect()
                except Exception:
                    pass
            self.transport = None
            self.adapter = None
            self.connected = False
            raise

    async def get_or_create_telemetry_engine(self) -> TelemetryEngine:
        if self.telemetry_engine is not None and self.telemetry_engine.running:
            return self.telemetry_engine

        adapter = await self.get_or_create_adapter()
        if self.mock_mode and isinstance(self.transport, MockTransport):
            self.transport.simulate_drive_cycle = True

        self.telemetry_engine = TelemetryEngine(adapter=adapter, fast_rate_target_hz=30.0)
        await self.telemetry_engine.start()
        return self.telemetry_engine

    async def stop_telemetry_engine_if_idle(self) -> None:
        if self.telemetry_engine and len(self.telemetry_engine._subscribers) == 0:
            await self.telemetry_engine.stop()
            self.telemetry_engine = None


state = AppState()


# --- Pydantic Request Models ---
class ConnectRequest(BaseModel):
    mock: bool = True
    mac: Optional[str] = None
    mock_rpm: int = 0
    platform: Optional[str] = None


class WriteFeatureRequest(BaseModel):
    module_address: str
    feature_id: str
    enabled: bool
    platform: Optional[str] = None


class WriteRawRequest(BaseModel):
    module_address: str
    hex_data: str


class RestoreRequest(BaseModel):
    backup_id: int


class AddCustomFeatureRequest(BaseModel):
    platform: str
    module_address: str
    id: str
    category: str
    byte: int
    bit: int
    name: str
    description: str
    prerequisites: Optional[str] = None


class TelemetryProfileRequest(BaseModel):
    profile: str  # "idle", "city", "highway", "spirited"


# --- API Routes ---
@app.get("/api/status")
async def get_status():
    rpm = 0
    voltage = state.voltage
    if state.connected and state.adapter:
        try:
            rpm = await state.safety.validate_engine_off(state.adapter)
        except EngineRunningInterlockError:
            rpm = state.last_rpm
        except Exception:
            rpm = state.last_rpm
        state.last_rpm = rpm

    plat_info = detect_platform_from_vin(state.vin)

    return {
        "connected": state.connected,
        "mock_mode": state.mock_mode,
        "mac": state.ble_mac,
        "platform": state.platform,
        "battery_voltage": voltage,
        "engine_rpm": rpm,
        "engine_off_safe": rpm == 0,
        "vin": state.vin,
        "detected_vehicle": {
            "model": plat_info.model if plat_info else "Transporter T5.1",
            "brand": plat_info.brand if plat_info else "Volkswagen",
            "platform": plat_info.code if plat_info else state.platform,
            "years": plat_info.years if plat_info else "2010–2019",
        },
    }


@app.get("/api/platforms")
async def get_platforms():
    return [
        {
            "code": "PQ25",
            "name": "PQ25 Platform",
            "description": "Transporter T5.1 / T6 (7E/7F/7H), Polo 6R/6C, Ibiza 6J, Fabia 5J",
        },
        {
            "code": "PQ35",
            "name": "PQ35 / PQ46 Platform",
            "description": "Golf Mk5/Mk6, Caddy 2K, Touran, Tiguan 1, Scirocco, Passat B6/B7, Audi A3 8P",
        },
        {
            "code": "MQB",
            "name": "MQB Platform (non-SFD)",
            "description": "Golf Mk7, Transporter T6.1, Octavia 3, Leon 3, Audi A3 8V, Passat B8, Tiguan 2",
        },
    ]


@app.post("/api/connect")
async def post_connect(req: ConnectRequest):
    if state.is_connecting:
        logger.warning("Duplicate connect request rejected: connection already in progress.")
        raise HTTPException(
            status_code=409,
            detail="A connection attempt is already in progress. Please wait for it to complete.",
        )

    state.is_connecting = True
    try:
        async with state.connect_lock:
            logger.info(">>> Connect request received: mock=%s, mac=%s, platform=%s", req.mock, req.mac, req.platform)
            if state.telemetry_engine:
                logger.info("Stopping active telemetry engine before reconnect...")
                await state.telemetry_engine.stop()
                state.telemetry_engine = None

            if state.transport and state.transport.is_connected:
                logger.info("Disconnecting previous transport before reconnect...")
                try:
                    await state.transport.disconnect()
                except Exception as de:
                    logger.warning("Error disconnecting previous transport: %s", de)

            state.mock_mode = req.mock
            state.ble_mac = req.mac
            state.last_rpm = req.mock_rpm
            if req.platform:
                state.platform = req.platform

            adapter = await state.get_or_create_adapter()
            state.connected = True
            logger.info(">>> Successfully connected to %s (%s)", state.ble_mac or "Mock", adapter.device_version)
            return {
                "status": "connected",
                "version": adapter.device_version,
                "voltage": adapter.voltage,
                "mock": state.mock_mode,
                "mac": state.ble_mac,
                "platform": state.platform,
            }
    except HTTPException:
        raise
    except Exception as e:
        state.connected = False
        msg = str(e)
        logger.error("Connection attempt failed: %s", msg, exc_info=True)
        if isinstance(e, TimeoutError) or "timeout" in msg.lower() or "not found" in msg.lower():
            detail = (
                f"Could not connect to {state.ble_mac or 'adapter'}: Connection timed out. "
                "Ensure vehicle ignition is ON (OBD-II port powered) and adapter is within Bluetooth range."
            )
        else:
            detail = f"Connection failed: {msg}"
        raise HTTPException(status_code=400, detail=detail)
    finally:
        state.is_connecting = False


@app.post("/api/disconnect")
async def post_disconnect():
    async with state.connect_lock:
        logger.info(">>> Disconnect request received.")
        if state.telemetry_engine:
            await state.telemetry_engine.stop()
            state.telemetry_engine = None

        if state.transport:
            try:
                await state.transport.disconnect()
            except Exception as e:
                logger.warning("Error disconnecting transport: %s", e)
        state.connected = False
        state.adapter = None
        state.transport = None
        logger.info(">>> Disconnected successfully.")
        return {"status": "disconnected"}


@app.get("/api/scan")
async def get_scan(timeout: float = 4.0, all_devices: bool = False):
    logger.info("Scanning for BLE OBD adapters (timeout=%.1fs, all_devices=%s)...", timeout, all_devices)
    try:
        adapters = await scan_for_adapters(timeout=timeout, include_all=all_devices)
        logger.info("Scan finished: found %d devices.", len(adapters))
        for a in adapters:
            logger.info("  Found: %s (%s, RSSI=%d dBm, is_obd=%s)", a.name, a.address, a.rssi, a.is_obd)
        return [
            {
                "name": a.name,
                "address": a.address,
                "rssi": a.rssi,
                "is_recommended": a.is_recommended,
                "details": a.details,
                "is_obd": a.is_obd,
            }
            for a in adapters
        ]
    except Exception as e:
        logger.error("BLE Scan failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"BLE Scan failed: {e}")


@app.get("/api/modules")
async def get_modules():
    return [
        {
            "address": f"0x{cfg.address:02X}",
            "name": cfg.name,
            "description": cfg.description,
            "default_did": f"0x{cfg.default_coding_did:04X}",
            "is_blacklisted": cfg.address in BLACKLISTED_MODULES,
        }
        for cfg in MODULE_REGISTRY.values()
    ]


@app.get("/api/module/{addr_str}/coding")
async def get_module_coding(addr_str: str, platform: Optional[str] = Query(None)):
    addr = int(addr_str, 16)
    try:
        state.safety.validate_module_allowed(addr)
    except BlacklistedModuleError as e:
        raise HTTPException(status_code=403, detail=str(e))

    active_plat = platform or state.platform

    adapter = await state.get_or_create_adapter()
    cfg = await adapter.set_module_address(addr)
    uds = UDSClient(adapter)

    async with uds:
        # Query VIN
        try:
            vin_b = await uds.read_data_by_id(DID_VIN)
            state.vin = vin_b.decode("ascii", errors="replace").strip()
            # If platform not explicitly overridden, detect from VIN
            if not platform:
                p_info = detect_platform_from_vin(state.vin)
                if p_info:
                    active_plat = p_info.code
                    state.platform = p_info.code
        except Exception:
            pass

        coding_bytes = await uds.read_data_by_id(cfg.default_coding_did)
        state.cached_coding[addr] = bytearray(coding_bytes)

    schema = state.schema_loader.get_schema(module_address=addr, platform=active_plat)
    features_data = []
    if schema:
        states = schema.evaluate_features(coding_bytes)
        for f in schema.features:
            features_data.append({
                "id": f.id,
                "category": f.category,
                "name": f.name,
                "description": f.description,
                "prerequisites": f.prerequisites,
                "byte": f.byte,
                "bit": f.bit,
                "enabled": states.get(f.id, False),
            })

    return {
        "module_address": f"0x{addr:02X}",
        "name": cfg.name,
        "platform": active_plat,
        "did": f"0x{cfg.default_coding_did:04X}",
        "byte_length": len(coding_bytes),
        "raw_hex": coding_bytes.hex().upper(),
        "bytes": list(coding_bytes),
        "features": features_data,
    }


@app.post("/api/module/write_feature")
async def post_write_feature(req: WriteFeatureRequest):
    addr = int(req.module_address, 16)
    state.safety.validate_module_allowed(addr)

    active_plat = req.platform or state.platform
    schema = state.schema_loader.get_schema(addr, platform=active_plat)
    if not schema:
        raise HTTPException(status_code=404, detail=f"Schema not found for module on {active_plat}.")

    feature = schema.get_feature(req.feature_id)
    if not feature:
        raise HTTPException(status_code=404, detail=f"Feature {req.feature_id} not found.")

    adapter = await state.get_or_create_adapter()
    cfg = await adapter.set_module_address(addr)
    uds = UDSClient(adapter)

    async with uds:
        orig_bytes = await uds.read_data_by_id(cfg.default_coding_did)
        mod_bytes = bytearray(orig_bytes)
        schema.apply_feature(mod_bytes, req.feature_id, req.enabled)

        diffs = compute_byte_diff(orig_bytes, mod_bytes)
        if not diffs:
            return {"status": "no_change", "detail": "Feature already in requested state"}

        backup = await state.safety.execute_safe_write(
            uds_client=uds,
            module_address=addr,
            did=cfg.default_coding_did,
            original_bytes=orig_bytes,
            modified_bytes=bytes(mod_bytes),
            vin=state.vin,
            skip_engine_check=state.mock_mode,
        )
        state.cached_coding[addr] = mod_bytes

        return {
            "status": "success",
            "backup_id": backup.id,
            "raw_hex": mod_bytes.hex().upper(),
            "diffs": [
                {
                    "byte": d.byte_index,
                    "old_hex": d.old_hex,
                    "new_hex": d.new_hex,
                    "changed_bits": [
                        {"bit": cb.bit_index, "old": cb.old_value, "new": cb.new_value}
                        for cb in d.changed_bits
                    ],
                }
                for d in diffs
            ],
        }


@app.post("/api/module/write_raw")
async def post_write_raw(req: WriteRawRequest):
    addr = int(req.module_address, 16)
    state.safety.validate_module_allowed(addr)

    new_bytes = bytes.fromhex(req.hex_data.replace(" ", ""))

    adapter = await state.get_or_create_adapter()
    cfg = await adapter.set_module_address(addr)
    uds = UDSClient(adapter)

    async with uds:
        orig_bytes = await uds.read_data_by_id(cfg.default_coding_did)
        state.safety.validate_payload_length(orig_bytes, new_bytes)

        backup = await state.safety.execute_safe_write(
            uds_client=uds,
            module_address=addr,
            did=cfg.default_coding_did,
            original_bytes=orig_bytes,
            modified_bytes=new_bytes,
            vin=state.vin,
            skip_engine_check=state.mock_mode,
        )
        state.cached_coding[addr] = bytearray(new_bytes)
        return {"status": "success", "backup_id": backup.id, "raw_hex": new_bytes.hex().upper()}


@app.get("/api/backups")
async def get_backups():
    backups = state.storage.list_backups()
    return [
        {
            "id": b.id,
            "timestamp": b.timestamp,
            "vin": b.vin,
            "module_address": b.module_address,
            "did": b.did,
            "byte_length": len(bytes.fromhex(b.raw_hex_data)),
            "raw_hex_data": b.raw_hex_data,
        }
        for b in backups
    ]


@app.post("/api/backups/restore")
async def post_restore(req: RestoreRequest):
    backup = state.storage.get_backup_by_id(req.backup_id)
    if not backup:
        raise HTTPException(status_code=404, detail="Backup record not found.")

    addr = int(backup.module_address, 16)
    did = int(backup.did, 16)
    restore_bytes = bytes.fromhex(backup.raw_hex_data)

    adapter = await state.get_or_create_adapter()
    await adapter.set_module_address(addr)
    uds = UDSClient(adapter)

    async with uds:
        current_bytes = await uds.read_data_by_id(did)
        new_backup = await state.safety.execute_safe_write(
            uds_client=uds,
            module_address=addr,
            did=did,
            original_bytes=current_bytes,
            modified_bytes=restore_bytes,
            vin=backup.vin,
            skip_engine_check=state.mock_mode,
        )
        state.cached_coding[addr] = bytearray(restore_bytes)
        return {
            "status": "success",
            "restored_backup_id": backup.id,
            "new_snapshot_id": new_backup.id,
            "raw_hex": restore_bytes.hex().upper(),
        }


@app.get("/api/module/{addr_str}/dtcs")
async def get_module_dtcs(addr_str: str):
    addr = int(addr_str, 16)
    adapter = await state.get_or_create_adapter()
    await adapter.set_module_address(addr)
    uds = UDSClient(adapter)
    async with uds:
        dtcs = await uds.read_dtcs()
        return {"module_address": f"0x{addr:02X}", "dtcs": dtcs}


@app.post("/api/module/{addr_str}/dtcs/clear")
async def post_clear_dtcs(addr_str: str):
    addr = int(addr_str, 16)
    adapter = await state.get_or_create_adapter()
    await adapter.set_module_address(addr)
    uds = UDSClient(adapter)
    async with uds:
        success = await uds.clear_dtcs()
        return {"status": "cleared" if success else "failed"}


# --- Custom Schema & Community Export Endpoints ---
@app.post("/api/schema/add_custom")
async def post_add_custom(req: AddCustomFeatureRequest):
    feat = VehicleFeature(
        id=req.id,
        category=req.category,
        byte=req.byte,
        bit=req.bit,
        name=req.name,
        description=req.description,
        prerequisites=req.prerequisites,
    )
    state.schema_loader.add_custom_feature(
        platform=req.platform,
        module_address=req.module_address,
        feature=feat,
    )
    return {"status": "success", "feature_id": req.id}


@app.get("/api/schema/export")
async def get_export_schema(platform: str = "PQ25", module: str = "0x09"):
    try:
        json_str = state.schema_loader.export_community_schema(
            platform=platform,
            module_address=module,
        )
        return Response(
            content=json_str,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename=schema_{platform.lower()}_{module.lower()}.json"},
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# --- Real-Time Telemetry Endpoints ---
@app.get("/api/telemetry/latest")
async def get_telemetry_latest():
    if state.telemetry_engine:
        return state.telemetry_engine.latest_data
    return {
        "speed": 0.0,
        "rpm": 0.0,
        "boost": 0.0,
        "throttle": 0.0,
        "coolant_temp": 85.0,
        "iat": 22.0,
        "fuel_rail_pressure": 350.0,
        "runtime": 0.0,
        "dpf_soot": 14.2,
        "egt_turbo": 260.0,
        "gear": 0.0,
        "sampling_hz": 0.0,
        "latency_ms": 0.0,
        "packets_count": 0,
    }


@app.post("/api/telemetry/profile")
async def post_telemetry_profile(req: TelemetryProfileRequest):
    if state.transport and isinstance(state.transport, MockTransport):
        state.transport.simulate_drive_cycle = True
        state.transport.drive_cycle.mode = req.profile
        return {"status": "success", "profile": req.profile}
    return {"status": "ignored", "detail": "Active transport is physical BLE"}


@app.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    engine = None
    queue = None
    try:
        engine = await state.get_or_create_telemetry_engine()
        queue = engine.subscribe()
    except Exception as e:
        logger.error("Failed to initialize telemetry engine: %s", e)
        await websocket.close(code=1011, reason=str(e))
        return

    try:
        # Send initial snapshot immediately so gauges render
        await websocket.send_json(engine.latest_data)
        while True:
            packet = await queue.get()
            await websocket.send_json(packet)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("Telemetry websocket disconnected: %s", e)
    finally:
        if engine and queue:
            engine.unsubscribe(queue)
        await state.stop_telemetry_engine_if_idle()


# Static UI Mount
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/", response_class=HTMLResponse)
async def index():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return HTMLResponse(content=index_file.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>vibesODB2 Static Dashboard Loading...</h1>")
