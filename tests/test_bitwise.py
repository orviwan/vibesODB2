"""
Unit tests for the Bitwise State Engine.
"""

import pytest
from vibesodb2.safety.bitwise import (
    get_bit,
    set_bit,
    toggle_bit,
    compute_byte_diff,
    format_hex_dump,
)


def test_get_bit():
    # 0b00000001 = 1
    assert get_bit(bytes([0x01]), 0, 0) is True
    assert get_bit(bytes([0x01]), 0, 1) is False

    # 0b10000000 = 0x80
    assert get_bit(bytes([0x80]), 0, 7) is True
    assert get_bit(bytes([0x80]), 0, 6) is False

    # Multi-byte
    data = bytes([0x00, 0xFF, 0x55])
    assert get_bit(data, 1, 3) is True
    assert get_bit(data, 2, 0) is True  # 0x55 = 0b01010101
    assert get_bit(data, 2, 1) is False

    with pytest.raises(IndexError):
        get_bit(data, 3, 0)

    with pytest.raises(ValueError):
        get_bit(data, 0, 8)


def test_set_bit():
    buf = bytearray([0x00, 0x00])

    # Set Byte 0 Bit 0
    set_bit(buf, 0, 0, True)
    assert buf[0] == 0x01

    # Set Byte 0 Bit 7
    set_bit(buf, 0, 7, True)
    assert buf[0] == 0x81

    # Clear Byte 0 Bit 0
    set_bit(buf, 0, 0, False)
    assert buf[0] == 0x80

    # Set Byte 1 Bit 4
    set_bit(buf, 1, 4, True)
    assert buf[1] == 0x10


def test_toggle_bit():
    buf = bytearray([0x00])
    new_state = toggle_bit(buf, 0, 2)
    assert new_state is True
    assert buf[0] == 0x04

    new_state = toggle_bit(buf, 0, 2)
    assert new_state is False
    assert buf[0] == 0x00


def test_compute_byte_diff():
    orig = bytes.fromhex("B028403C")
    mod = bytes.fromhex("B128403D")

    diffs = compute_byte_diff(orig, mod)
    assert len(diffs) == 2

    # Byte 0: B0 -> B1
    assert diffs[0].byte_index == 0
    assert diffs[0].old_hex == "B0"
    assert diffs[0].new_hex == "B1"
    assert len(diffs[0].changed_bits) == 1
    assert diffs[0].changed_bits[0].bit_index == 0
    assert diffs[0].changed_bits[0].old_value == 0
    assert diffs[0].changed_bits[0].new_value == 1

    # Byte 3: 3C -> 3D (0b00111100 -> 0b00111101)
    assert diffs[1].byte_index == 3
    assert diffs[1].old_hex == "3C"
    assert diffs[1].new_hex == "3D"


def test_format_hex_dump():
    data = bytes.fromhex("B028403C0824")
    dump = format_hex_dump(data, bytes_per_line=4)
    assert "Byte 00-03: B0 28 40 3C" in dump
    assert "Byte 04-05: 08 24" in dump
