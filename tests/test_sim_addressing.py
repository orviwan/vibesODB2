"""
The simulator must behave like a real bus: a UDS request sent on the 7DF functional broadcast
header (or any header that is not a known module) must not be answered by the BCM. Earlier the
simulator defaulted unknown headers to 0x09, which hid a real write-on-broadcast bug in the PWA.
"""
from vibesodb2.sim.adapter import SimulatedELM327
from vibesodb2.sim.vehicle import SimulatedVehicle


def test_write_on_broadcast_header_is_not_applied():
    vehicle = SimulatedVehicle(profile_id="transporter_t51")
    elm = SimulatedELM327(vehicle)
    elm.process_command("ATSH 7DF")
    before = bytes(vehicle.get_module(0x09).coding)
    resp = elm.process_command("1003")
    resp = elm.process_command("2E0600" + "FF" * len(before))
    assert not resp.upper().startswith("6E"), resp
    assert bytes(vehicle.get_module(0x09).coding) == before


def test_bcm_header_still_addresses_bcm():
    vehicle = SimulatedVehicle(profile_id="transporter_t51")
    elm = SimulatedELM327(vehicle)
    elm.process_command("ATSH 70E")
    assert elm.current_module_addr == 0x09
