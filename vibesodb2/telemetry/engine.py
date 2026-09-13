"""
High-performance Multi-Frequency Telemetry Engine.
Coordinates tiered polling loops (fast vs slow vs UDS), calculates sampling Hz,
and broadcasts telemetry packets to WebSockets and CLI dashboards.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Callable, Dict, List, Optional, Set

from vibesodb2.adapter.elm327 import ELM327Adapter
from vibesodb2.telemetry.metrics import (
    FrequencyTier,
    METRIC_REGISTRY,
    TelemetryMetric,
)

logger = logging.getLogger(__name__)


class TelemetryEngine:
    """
    Multi-frequency asynchronous polling engine for live automotive telemetry.
    """

    def __init__(
        self,
        adapter: ELM327Adapter,
        fast_rate_target_hz: float = 30.0,
        slow_interval_seconds: float = 1.0,
        uds_interval_seconds: float = 0.5,
        enable_uds: bool = True,
    ):
        self.adapter = adapter
        self.fast_rate_target_hz = fast_rate_target_hz
        self.slow_interval_seconds = slow_interval_seconds
        self.uds_interval_seconds = uds_interval_seconds
        self.enable_uds = enable_uds

        self.running: bool = False
        self._poll_task: Optional[asyncio.Task] = None

        # Telemetry State
        self.latest_data: Dict[str, float] = {
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

        # Sampling statistics
        self.total_samples: int = 0
        self.current_hz: float = 0.0
        self.last_latency_ms: float = 0.0

        # Active metrics partitioned by frequency tier
        self.fast_metrics: List[TelemetryMetric] = [
            m for m in METRIC_REGISTRY.values() if m.tier == FrequencyTier.FAST
        ]
        self.slow_metrics: List[TelemetryMetric] = [
            m for m in METRIC_REGISTRY.values() if m.tier == FrequencyTier.SLOW
        ]
        self.uds_metrics: List[TelemetryMetric] = [
            m for m in METRIC_REGISTRY.values() if m.tier == FrequencyTier.UDS
        ]

        # Subscribers (e.g. WebSocket clients, Terminal renderers)
        self._subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        """Subscribes an async queue to receive live telemetry dicts."""
        q = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        """Unsubscribes a queue."""
        self._subscribers.discard(q)

    def _broadcast(self, packet: Dict[str, float]) -> None:
        for q in list(self._subscribers):
            try:
                if q.full():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                q.put_nowait(packet)
            except Exception:
                pass

    async def start(self) -> None:
        """Starts the multi-frequency polling loop."""
        if self.running:
            return

        self.running = True
        try:
            await self.adapter.send_at_expect_ok("ATSH 7DF")
            await self.adapter.send_at_expect_ok("ATCRA")
        except Exception:
            pass
        logger.info("Starting Telemetry Engine (Fast: %.1f Hz target, Slow: %.1fs)...",
                    self.fast_rate_target_hz, self.slow_interval_seconds)
        self._poll_task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        """Stops the telemetry loop."""
        self.running = False
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
        self._poll_task = None
        logger.info("Telemetry Engine stopped.")

    async def __aenter__(self) -> "TelemetryEngine":
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.stop()

    async def _run_loop(self) -> None:
        last_slow_time = 0.0
        last_uds_time = 0.0
        hz_window_start = time.time()
        hz_window_count = 0

        # Delay between fast queries to respect target Hz
        min_interval = 1.0 / max(1.0, self.fast_rate_target_hz)

        try:
            while self.running:
                loop_start = time.time()

                # --- 1. Query FAST Tier (Speed, RPM, Boost, Throttle) ---
                for metric in self.fast_metrics:
                    if not self.running:
                        break
                    t0 = time.time()
                    try:
                        resp = await self.adapter.transport.send_command(metric.command, timeout=0.8)
                        val = metric.decode(resp)
                        if val is not None:
                            self.latest_data[metric.id] = val
                    except Exception as e:
                        logger.debug("Fast query error (%s): %s", metric.command, e)

                    dt_ms = (time.time() - t0) * 1000.0
                    self.last_latency_ms = dt_ms

                    self.total_samples += 1
                    hz_window_count += 1

                # --- 2. Query SLOW Tier if interval passed (Coolant, IAT, Fuel, Runtime) ---
                now = time.time()
                if now - last_slow_time >= self.slow_interval_seconds:
                    last_slow_time = now
                    for metric in self.slow_metrics:
                        if not self.running:
                            break
                        try:
                            resp = await self.adapter.transport.send_command(metric.command, timeout=1.0)
                            val = metric.decode(resp)
                            if val is not None:
                                self.latest_data[metric.id] = val
                        except Exception as e:
                            logger.debug("Slow query error (%s): %s", metric.command, e)
                        self.total_samples += 1
                        hz_window_count += 1

                # --- 3. Query OEM VAG UDS Tier (DPF, EGT, Gear) ---
                if self.enable_uds and (now - last_uds_time >= self.uds_interval_seconds):
                    last_uds_time = now
                    for metric in self.uds_metrics:
                        if not self.running:
                            break
                        try:
                            resp = await self.adapter.transport.send_command(metric.command, timeout=1.0)
                            val = metric.decode(resp)
                            if val is not None:
                                self.latest_data[metric.id] = val
                        except Exception as e:
                            logger.debug("UDS query error (%s): %s", metric.command, e)
                        self.total_samples += 1
                        hz_window_count += 1

                # Calculate sampling frequency (Hz)
                time_in_window = time.time() - hz_window_start
                if time_in_window >= 1.0:
                    self.current_hz = round(hz_window_count / time_in_window, 1)
                    hz_window_start = time.time()
                    hz_window_count = 0

                self.latest_data["sampling_hz"] = self.current_hz
                self.latest_data["latency_ms"] = round(self.last_latency_ms, 1)
                self.latest_data["packets_count"] = self.total_samples

                # Broadcast snapshot
                packet = dict(self.latest_data)
                self._broadcast(packet)

                # Rate limiter sleep if cycle finished faster than target interval
                elapsed = time.time() - loop_start
                sleep_needed = min_interval - elapsed
                if sleep_needed > 0.005:
                    await asyncio.sleep(sleep_needed)
                else:
                    await asyncio.sleep(0.001)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error("Unexpected error in telemetry loop: %s", e)
        finally:
            self.running = False
