"""
Unit tests for VAG Platform Taxonomy and VIN Auto-Detection.
"""

import pytest
from vibesodb2.schema.platforms import (
    detect_platform_from_vin,
    get_supported_platforms,
)


def test_supported_platforms():
    platforms = get_supported_platforms()
    assert "PQ25" in platforms
    assert "PQ35" in platforms
    assert "MQB" in platforms


def test_vin_detection_pq25():
    # Transporter T5.1 (WV1ZZZ7EZEH012345)
    info = detect_platform_from_vin("WV1ZZZ7EZEH012345")
    assert info is not None
    assert info.code == "PQ25"
    assert "Transporter" in info.model
    assert "Volkswagen" in info.brand

    # Polo 6R (WVWZZZ6RZAY123456)
    info_polo = detect_platform_from_vin("WVWZZZ6RZAY123456")
    assert info_polo is not None
    assert info_polo.code == "PQ25"
    assert "Polo" in info_polo.model

    # Ibiza 6J (VSSZZZ6JZAR123456)
    info_ibiza = detect_platform_from_vin("VSSZZZ6JZAR123456")
    assert info_ibiza is not None
    assert info_ibiza.code == "PQ25"
    assert "Ibiza" in info_ibiza.model


def test_vin_detection_pq35():
    # Golf Mk6 (WVWZZZ5KZAW123456)
    info_golf6 = detect_platform_from_vin("WVWZZZ5KZAW123456")
    assert info_golf6 is not None
    assert info_golf6.code == "PQ35"
    assert "Golf" in info_golf6.model

    # Caddy (WV1ZZZ2KZCX123456)
    info_caddy = detect_platform_from_vin("WV1ZZZ2KZCX123456")
    assert info_caddy is not None
    assert info_caddy.code == "PQ35"
    assert "Caddy" in info_caddy.model

    # Audi A3 8P (WAUZZZ8PZAA123456)
    info_a3 = detect_platform_from_vin("WAUZZZ8PZAA123456")
    assert info_a3 is not None
    assert info_a3.code == "PQ35"
    assert "A3" in info_a3.model

    # Škoda Octavia 1Z (TMBZZZ1ZZ82123456)
    info_octavia = detect_platform_from_vin("TMBZZZ1ZZ82123456")
    assert info_octavia is not None
    assert info_octavia.code == "PQ35"
    assert "Octavia" in info_octavia.model


def test_vin_detection_mqb():
    # Golf Mk7 (WVWZZZ5GZDW123456)
    info_golf7 = detect_platform_from_vin("WVWZZZ5GZDW123456")
    assert info_golf7 is not None
    assert info_golf7.code == "MQB"
    assert "Golf Mk7" in info_golf7.model

    # Audi A3 8V (WAUZZZ8VZFA123456)
    info_a3_mqb = detect_platform_from_vin("WAUZZZ8VZFA123456")
    assert info_a3_mqb is not None
    assert info_a3_mqb.code == "MQB"
    assert "A3" in info_a3_mqb.model

    # Transporter T6.1 (WV1ZZZ7LZLH123456)
    info_t61 = detect_platform_from_vin("WV1ZZZ7LZLH123456")
    assert info_t61 is not None
    assert info_t61.code == "MQB"


def test_invalid_vin():
    assert detect_platform_from_vin("") is None
    assert detect_platform_from_vin("INVALID") is None
    assert detect_platform_from_vin("123456789") is None
