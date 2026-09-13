"""
Bitwise State Engine.
Provides rigorous in-memory bit and byte manipulation according to VAG Long Coding specifications.
Never manipulates strings directly.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple


@dataclass
class ChangedBit:
    bit_index: int
    old_value: int
    new_value: int


@dataclass
class ByteDiff:
    byte_index: int
    old_byte: int
    new_byte: int
    old_hex: str
    new_hex: str
    changed_bits: List[ChangedBit]


def get_bit(data: bytes | bytearray, byte_index: int, bit_index: int) -> bool:
    """
    Extracts the binary state of a single bit at the specified coordinate.
    Bit State = (ByteArray[ByteIndex] >> BitIndex) & 1
    """
    if byte_index < 0 or byte_index >= len(data):
        raise IndexError(
            f"Byte index {byte_index} out of range for bytearray of length {len(data)}."
        )
    if not (0 <= bit_index <= 7):
        raise ValueError(f"Bit index {bit_index} must be between 0 and 7.")

    return bool((data[byte_index] >> bit_index) & 1)


def set_bit(data: bytearray, byte_index: int, bit_index: int, value: bool) -> None:
    """
    Sets or clears a single bit at the specified coordinate in-place.
    Set Bit (True):   ByteArray[ByteIndex] |= (1 << BitIndex)
    Clear Bit (False): ByteArray[ByteIndex] &= ~(1 << BitIndex)
    """
    if byte_index < 0 or byte_index >= len(data):
        raise IndexError(
            f"Byte index {byte_index} out of range for bytearray of length {len(data)}."
        )
    if not (0 <= bit_index <= 7):
        raise ValueError(f"Bit index {bit_index} must be between 0 and 7.")

    if value:
        data[byte_index] |= 1 << bit_index
    else:
        data[byte_index] &= ~(1 << bit_index)


def toggle_bit(data: bytearray, byte_index: int, bit_index: int) -> bool:
    """
    Toggles a single bit and returns the new boolean state.
    """
    current = get_bit(data, byte_index, bit_index)
    new_state = not current
    set_bit(data, byte_index, bit_index, new_state)
    return new_state


def compute_byte_diff(original: bytes | bytearray, modified: bytes | bytearray) -> List[ByteDiff]:
    """
    Compares two byte arrays and returns structured differences down to the bit level.
    """
    if len(original) != len(modified):
        raise ValueError(
            f"Cannot diff payloads of differing lengths: {len(original)} vs {len(modified)}"
        )

    diffs: List[ByteDiff] = []
    for byte_idx in range(len(original)):
        old_b = original[byte_idx]
        new_b = modified[byte_idx]
        if old_b != new_b:
            changed_bits: List[ChangedBit] = []
            for bit_idx in range(8):
                old_bit = (old_b >> bit_idx) & 1
                new_bit = (new_b >> bit_idx) & 1
                if old_bit != new_bit:
                    changed_bits.append(ChangedBit(bit_index=bit_idx, old_value=old_bit, new_value=new_bit))

            diffs.append(
                ByteDiff(
                    byte_index=byte_idx,
                    old_byte=old_b,
                    new_byte=new_b,
                    old_hex=f"{old_b:02X}",
                    new_hex=f"{new_b:02X}",
                    changed_bits=changed_bits,
                )
            )

    return diffs


def format_hex_dump(data: bytes | bytearray, bytes_per_line: int = 16) -> str:
    """
    Formats a byte array as a clean, human-readable hex dump with byte indices.
    """
    lines: List[str] = []
    for i in range(0, len(data), bytes_per_line):
        chunk = data[i : i + bytes_per_line]
        hex_str = " ".join(f"{b:02X}" for b in chunk)
        lines.append(f"Byte {i:02d}-{i + len(chunk) - 1:02d}: {hex_str}")
    return "\n".join(lines)
