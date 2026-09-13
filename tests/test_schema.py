"""
Unit tests for Decoupled Community Schemas and Loader.
"""

import pytest
from vibesodb2.ble.mock_transport import DEFAULT_T51_BCM_CODING
from vibesodb2.safety.bitwise import get_bit
from vibesodb2.schema.loader import SchemaLoader
from vibesodb2.schema.models import ModuleSchema, VehicleFeature


def test_schema_loader_bundled():
    loader = SchemaLoader()
    schemas = loader.list_schemas()
    assert len(schemas) >= 4

    bcm_schema = loader.get_schema(module_address="0x09", platform="PQ25_T51")
    assert bcm_schema is not None
    assert bcm_schema.platform == "PQ25_T51"
    assert bcm_schema.tx_header == "70E"
    assert bcm_schema.rx_filter == "778"
    assert bcm_schema.expected_byte_length == 30
    assert len(bcm_schema.features) >= 5

    # Check cluster schema
    cluster_schema = loader.get_schema(module_address="0x17", platform="PQ25_T51")
    assert cluster_schema is not None
    assert cluster_schema.tx_header == "714"


def test_schema_feature_evaluation():
    loader = SchemaLoader()
    bcm_schema = loader.get_schema(module_address="0x09", platform="PQ25_T51")
    assert bcm_schema is not None

    states = bcm_schema.evaluate_features(DEFAULT_T51_BCM_CODING)
    # Check that teardrop wipe (Byte 3 Bit 4) is evaluated correctly
    # Byte 3 in DEFAULT_T51_BCM_CODING is 0x3C (0b00111100 -> bit 4 is 1)
    assert states.get("teardrop_wipe_front") is True
    # Byte 12 in DEFAULT_T51_BCM_CODING is 0x28 (0b00101000 -> bit 0 is 0)
    assert states.get("cornering_fog_lights") is False


def test_schema_apply_feature():
    loader = SchemaLoader()
    bcm_schema = loader.get_schema(module_address="0x09", platform="PQ25_T51")
    assert bcm_schema is not None

    buf = bytearray(DEFAULT_T51_BCM_CODING)
    assert get_bit(buf, 12, 0) is False

    # Enable cornering fog lights (Byte 12, Bit 0)
    bcm_schema.apply_feature(buf, "cornering_fog_lights", True)
    assert get_bit(buf, 12, 0) is True

    # Disable teardrop wipe (Byte 3, Bit 4)
    assert get_bit(buf, 3, 4) is True
    bcm_schema.apply_feature(buf, "teardrop_wipe_front", False)
    assert get_bit(buf, 3, 4) is False
