"""
vibesODB2 Vehicle Simulator Package.
Provides high-fidelity emulation of VAG ECUs, ELM327/STN adapters,
ISO-TP framing, and dynamic physics loops for automated testing.
"""

from vibesodb2.sim.vehicle import SimulatedVehicle, VehicleProfile
from vibesodb2.sim.adapter import SimulatedELM327
from vibesodb2.sim.transport import SimulatedTransport

__all__ = [
    "SimulatedVehicle",
    "VehicleProfile",
    "SimulatedELM327",
    "SimulatedTransport",
]
