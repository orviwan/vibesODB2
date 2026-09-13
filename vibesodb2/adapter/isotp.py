"""
ISO-TP (ISO 15765-2) protocol handler.
Provides frame packetization, multi-frame reassembly, and flow control generation.
Used both as software ISO-TP transport and frame parser.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional

logger = logging.getLogger(__name__)

# Frame Types (PCI: Protocol Control Information)
PCI_SINGLE_FRAME = 0x00
PCI_FIRST_FRAME = 0x10
PCI_CONSECUTIVE_FRAME = 0x20
PCI_FLOW_CONTROL = 0x30

# Flow Status
FS_CONTINUE_TO_SEND = 0x00
FS_WAIT = 0x01
FS_OVERFLOW = 0x02


@dataclass
class IsoTpFrame:
    frame_type: int
    data: bytes
    total_length: Optional[int] = None
    sequence_number: Optional[int] = None


class IsoTpReassembler:
    """
    Reassembles multi-frame ISO-TP CAN packets into a complete UDS payload.
    """

    def __init__(self):
        self.reset()

    def reset(self) -> None:
        self.total_expected_length: int = 0
        self.assembled_payload = bytearray()
        self.next_sequence_number: int = 1
        self.in_progress: bool = False

    def process_frame(self, frame_bytes: bytes) -> Optional[bytes]:
        """
        Processes a raw CAN data payload (typically 8 bytes).
        Returns the completed reassembled payload when all frames are collected, or None if awaiting more frames.
        """
        if not frame_bytes:
            return None

        pci_type = frame_bytes[0] & 0xF0

        # --- Single Frame (SF) ---
        if pci_type == PCI_SINGLE_FRAME:
            length = frame_bytes[0] & 0x0F
            if length == 0 or length > 7:
                # Malformed single frame
                return None
            self.reset()
            return frame_bytes[1 : 1 + length]

        # --- First Frame (FF) ---
        elif pci_type == PCI_FIRST_FRAME:
            if len(frame_bytes) < 2:
                return None
            total_length = ((frame_bytes[0] & 0x0F) << 8) | frame_bytes[1]
            self.total_expected_length = total_length
            self.assembled_payload = bytearray(frame_bytes[2:])
            self.next_sequence_number = 1
            self.in_progress = True
            if len(self.assembled_payload) >= self.total_expected_length:
                payload = bytes(self.assembled_payload[: self.total_expected_length])
                self.reset()
                return payload
            return None

        # --- Consecutive Frame (CF) ---
        elif pci_type == PCI_CONSECUTIVE_FRAME:
            if not self.in_progress:
                logger.warning("Received Consecutive Frame while not in progress.")
                return None

            seq_num = frame_bytes[0] & 0x0F
            if seq_num != (self.next_sequence_number & 0x0F):
                logger.warning(
                    "Sequence mismatch in CF: expected %d, got %d",
                    self.next_sequence_number & 0x0F,
                    seq_num,
                )

            self.next_sequence_number += 1
            self.assembled_payload.extend(frame_bytes[1:])

            if len(self.assembled_payload) >= self.total_expected_length:
                payload = bytes(self.assembled_payload[: self.total_expected_length])
                self.reset()
                return payload
            return None

        # --- Flow Control (FC) ---
        elif pci_type == PCI_FLOW_CONTROL:
            logger.debug("Received Flow Control frame.")
            return None

        return None


def create_flow_control_frame(block_size: int = 0, st_min: int = 0) -> bytes:
    """
    Generates a standard Flow Control frame (0x30 0x00 0x00).
    Block size 0 = transmit all remaining consecutive frames without delay.
    """
    return bytes([PCI_FLOW_CONTROL | FS_CONTINUE_TO_SEND, block_size, st_min])


def packetize_isotp(payload: bytes) -> List[bytes]:
    """
    Splits an arbitrary length UDS payload into CAN ISO-TP frames (Single Frame or FF + CFs).
    """
    length = len(payload)
    if length <= 7:
        # Single frame: [0x0L, byte0, byte1, ...]
        frame = bytes([PCI_SINGLE_FRAME | length]) + payload
        # Pad to 8 bytes if needed
        return [frame.ljust(8, b"\x00")]

    frames: List[bytes] = []
    # First Frame: [0x10 | (len >> 8), len & 0xFF, byte0..byte5]
    ff_header = bytes([PCI_FIRST_FRAME | ((length >> 8) & 0x0F), length & 0xFF])
    frames.append(ff_header + payload[:6])

    offset = 6
    seq = 1
    while offset < length:
        chunk = payload[offset : offset + 7]
        cf_header = bytes([PCI_CONSECUTIVE_FRAME | (seq & 0x0F)])
        frames.append((cf_header + chunk).ljust(8, b"\x00"))
        offset += len(chunk)
        seq = (seq + 1) & 0x0F

    return frames
