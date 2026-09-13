"""
Pydantic data models for clean-room vehicle configuration schemas.
Decouples functional vehicle coordinates from copyright-protected label texts.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from vibesodb2.safety.bitwise import get_bit, set_bit


class VehicleFeature(BaseModel):
    """Represents a single configurable vehicle setting mapped to a (byte, bit) coordinate."""

    id: str = Field(description="Unique machine-readable identifier")
    category: str = Field(description="UI Category (e.g. Lighting, Wipers, Central Locking)")
    byte: int = Field(description="Zero-indexed byte coordinate in long coding array", ge=0)
    bit: int = Field(description="Bit index (0-7)", ge=0, le=7)
    name: str = Field(description="Human-readable title")
    description: str = Field(description="Clear explanation of the feature behavior")
    prerequisites: Optional[str] = Field(default=None, description="Physical hardware or coding requirements")


class ModuleSchema(BaseModel):
    """Complete schema definition for a specific vehicle controller."""

    schema_url: Optional[str] = Field(default=None, alias="$schema")
    platform: str = Field(description="Target platform code (e.g. PQ25_T51, PQ35)")
    chassis_codes: List[str] = Field(default_factory=list, description="Vehicle chassis identifiers (e.g. 7E, 7F, 7H)")
    module_address: str = Field(description="Module address in hex string, e.g. 0x09")
    tx_header: str = Field(description="CAN arbitration transmit header (ATSH)")
    rx_filter: str = Field(description="CAN receive filter (ATCRA)")
    coding_did: str = Field(description="UDS Data Identifier (e.g. 0x0600)")
    expected_byte_length: int = Field(description="Expected byte length of the long coding array", gt=0)
    features: List[VehicleFeature] = Field(default_factory=list, description="List of feature mappings")

    model_config = {"populate_by_name": True}

    @property
    def module_address_int(self) -> int:
        return int(self.module_address, 16)

    @property
    def coding_did_int(self) -> int:
        return int(self.coding_did, 16)

    def get_feature(self, feature_id: str) -> Optional[VehicleFeature]:
        for f in self.features:
            if f.id == feature_id:
                return f
        return None

    def evaluate_features(self, coding_data: bytes | bytearray) -> Dict[str, bool]:
        """
        Evaluates the binary state of every feature in this schema against the raw coding byte array.
        Returns a dictionary mapping feature_id to boolean status.
        """
        states: Dict[str, bool] = {}
        for feature in self.features:
            if feature.byte < len(coding_data):
                states[feature.id] = get_bit(coding_data, feature.byte, feature.bit)
            else:
                states[feature.id] = False
        return states

    def apply_feature(self, coding_data: bytearray, feature_id: str, enabled: bool) -> None:
        """
        Updates the bit corresponding to feature_id in the provided bytearray.
        """
        feature = self.get_feature(feature_id)
        if not feature:
            raise KeyError(f"Feature '{feature_id}' not found in schema for module {self.module_address}.")
        if feature.byte >= len(coding_data):
            raise IndexError(
                f"Feature '{feature_id}' byte {feature.byte} exceeds coding length {len(coding_data)}."
            )
        set_bit(coding_data, feature.byte, feature.bit, enabled)
