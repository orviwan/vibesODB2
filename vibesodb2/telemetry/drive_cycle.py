"""
Dynamic Vehicle Drive Cycle Generator.
Simulates realistic vehicle powertrain physics, gear changes, turbo boost spooling,
and thermal dynamics for offline development and test benches.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass


@dataclass
class DriveCycleState:
    speed: float = 0.0          # km/h
    rpm: float = 800.0          # RPM
    gear: int = 1               # 1-6
    throttle: float = 0.0       # %
    map_kpa: float = 101.0      # kPa (101.3 = atmospheric)
    boost_bar: float = 0.0      # bar
    coolant_temp: float = 88.0  # °C
    iat: float = 24.0           # °C
    fuel_rail_bar: float = 300.0# bar
    runtime_s: int = 0
    dpf_soot_g: float = 14.82   # g
    egt_c: float = 280.0        # °C


class DriveCycleSimulator:
    """
    Simulates real-time vehicle dynamics with time-based progression.
    """

    def __init__(self, mode: str = "city"):
        self.mode = mode  # "idle", "city", "highway", "spirited"
        self.start_time = time.time()
        self.state = DriveCycleState()

    def update(self) -> DriveCycleState:
        elapsed = time.time() - self.start_time
        self.state.runtime_s = int(elapsed)

        # Warm up coolant over time up to 90°C
        self.state.coolant_temp = min(90.0, 30.0 + (elapsed * 0.5))

        if self.mode == "idle":
            self.state.speed = 0.0
            self.state.rpm = 800.0 + 15.0 * math.sin(elapsed * 2)
            self.state.gear = 0
            self.state.throttle = 0.0
            self.state.map_kpa = 101.0
            self.state.boost_bar = 0.0
            self.state.fuel_rail_bar = 280.0 + 10.0 * math.sin(elapsed)
            self.state.egt_c = 220.0

        elif self.mode == "city":
            # 40-second periodic cycle: idle -> accelerate 1-2-3 -> cruise -> stop
            cycle = elapsed % 40.0
            if cycle < 5.0:  # Red light stop
                self.state.speed = 0.0
                self.state.gear = 1
                self.state.throttle = 0.0
                self.state.rpm = 800.0
                self.state.boost_bar = 0.0
                self.state.egt_c = 240.0
            elif cycle < 12.0:  # 1st & 2nd gear acceleration
                t = cycle - 5.0
                self.state.throttle = 45.0
                if t < 3.5:
                    self.state.gear = 1
                    self.state.rpm = 1000.0 + (t / 3.5) * 2200.0
                    self.state.speed = (t / 3.5) * 22.0
                else:
                    self.state.gear = 2
                    self.state.rpm = 1600.0 + ((t - 3.5) / 3.5) * 1600.0
                    self.state.speed = 22.0 + ((t - 3.5) / 3.5) * 22.0
                self.state.boost_bar = 0.8
                self.state.egt_c = 380.0
            elif cycle < 28.0:  # 3rd gear cruising at ~48 km/h
                self.state.gear = 3
                self.state.speed = 48.0 + 3.0 * math.sin(cycle)
                self.state.rpm = 1850.0 + 80.0 * math.sin(cycle)
                self.state.throttle = 20.0
                self.state.boost_bar = 0.3
                self.state.egt_c = 310.0
            else:  # Braking to stop
                t = cycle - 28.0
                self.state.throttle = 0.0
                self.state.speed = max(0.0, 48.0 - (t / 12.0) * 48.0)
                self.state.rpm = max(800.0, 1800.0 - (t / 12.0) * 1000.0)
                self.state.gear = 2 if self.state.speed > 20 else 1
                self.state.boost_bar = 0.0

        elif self.mode == "highway":
            # Cruising at 115 km/h in 6th gear
            self.state.gear = 6
            self.state.speed = 115.0 + 5.0 * math.sin(elapsed * 0.2)
            self.state.rpm = 2150.0 + 80.0 * math.sin(elapsed * 0.2)
            self.state.throttle = 35.0
            self.state.boost_bar = 0.6 + 0.1 * math.sin(elapsed * 0.2)
            self.state.fuel_rail_bar = 950.0
            self.state.egt_c = 480.0

        elif self.mode == "spirited":
            # Hard acceleration through gears
            cycle = elapsed % 30.0
            t = cycle
            if t < 5.0:
                self.state.gear = 1
                self.state.speed = (t / 5.0) * 35.0
                self.state.rpm = 1200.0 + (t / 5.0) * 3200.0
            elif t < 10.0:
                self.state.gear = 2
                self.state.speed = 35.0 + ((t - 5.0) / 5.0) * 35.0
                self.state.rpm = 2200.0 + ((t - 5.0) / 5.0) * 2200.0
            elif t < 18.0:
                self.state.gear = 3
                self.state.speed = 70.0 + ((t - 10.0) / 8.0) * 45.0
                self.state.rpm = 2500.0 + ((t - 10.0) / 8.0) * 1900.0
            else:
                self.state.gear = 4
                self.state.speed = max(50.0, 115.0 - (t - 18.0) * 5.0)
                self.state.rpm = 2000.0

            self.state.throttle = 80.0 if t < 18.0 else 10.0
            self.state.boost_bar = 1.45 if t < 18.0 else 0.2
            self.state.fuel_rail_bar = 1550.0 if t < 18.0 else 500.0
            self.state.egt_c = 640.0 if t < 18.0 else 350.0

        self.state.map_kpa = 101.3 + (self.state.boost_bar * 100.0)
        return self.state
