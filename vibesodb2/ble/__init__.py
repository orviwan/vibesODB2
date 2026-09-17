from vibesodb2.ble.transport import Transport, BleNordicUartTransport
from vibesodb2.ble.discovery import scan_for_adapters, DiscoveredAdapter

__all__ = [
    "Transport",
    "BleNordicUartTransport",
    "scan_for_adapters",
    "DiscoveredAdapter",
    "MockTransport",
]


def __getattr__(name):
    # MockTransport wraps the simulator, which itself imports vibesodb2.ble.transport.
    # Importing it eagerly here created a circular import whenever vibesodb2.sim was
    # imported first, so it is resolved lazily.
    if name == "MockTransport":
        from vibesodb2.ble.mock_transport import MockTransport
        return MockTransport
    raise AttributeError(name)
