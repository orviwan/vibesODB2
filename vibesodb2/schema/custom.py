"""
User Custom Settings Override and Community Schema Submission Engine.
Enables advanced users to define custom bit overrides and export GitHub-ready community schemas.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

from vibesodb2.schema.models import ModuleSchema, VehicleFeature

logger = logging.getLogger(__name__)

CUSTOM_SCHEMAS_DIR = Path.home() / ".vibesodb2" / "custom_schemas"


class CustomSchemaManager:
    """
    Manages user-defined custom feature overrides and community schema exports.
    """

    def __init__(self, custom_dir: Optional[Path] = None):
        self.custom_dir = custom_dir or CUSTOM_SCHEMAS_DIR
        self.custom_dir.mkdir(parents=True, exist_ok=True)

    def _get_custom_file(self, platform: str, module_address: str | int) -> Path:
        mod_str = f"0x{module_address:02X}".lower() if isinstance(module_address, int) else module_address.lower()
        return self.custom_dir / f"custom_{platform.lower()}_{mod_str}.json"

    def list_custom_features(self, platform: str, module_address: str | int) -> List[VehicleFeature]:
        """Loads all custom feature overrides created by the user for this module."""
        filepath = self._get_custom_file(platform, module_address)
        if not filepath.exists():
            return []

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [VehicleFeature(**feat) for feat in data]
        except Exception as e:
            logger.warning("Error reading custom schema from %s: %s", filepath, e)
            return []

    def add_custom_feature(
        self,
        platform: str,
        module_address: str | int,
        feature: VehicleFeature,
    ) -> None:
        """Adds or updates a custom user feature setting."""
        features = self.list_custom_features(platform, module_address)
        # Filter out existing with same ID
        features = [f for f in features if f.id != feature.id]
        features.append(feature)

        filepath = self._get_custom_file(platform, module_address)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump([f.model_dump() for f in features], f, indent=2)
        logger.info("Custom feature '%s' saved to %s", feature.id, filepath)

    def remove_custom_feature(
        self,
        platform: str,
        module_address: str | int,
        feature_id: str,
    ) -> bool:
        """Removes a custom user feature."""
        features = self.list_custom_features(platform, module_address)
        initial_len = len(features)
        features = [f for f in features if f.id != feature_id]
        if len(features) < initial_len:
            filepath = self._get_custom_file(platform, module_address)
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump([f.model_dump() for f in features], f, indent=2)
            return True
        return False

    def export_for_github(
        self,
        base_schema: ModuleSchema,
        output_path: Optional[Path | str] = None,
    ) -> str:
        """
        Merges base schema with user custom features and exports a formatted,
        clean-room JSON file ready for GitHub Pull Request submission.
        """
        custom_features = self.list_custom_features(base_schema.platform, base_schema.module_address)

        # Merge features: base features + any custom features with unique IDs
        feature_dict = {f.id: f for f in base_schema.features}
        for cf in custom_features:
            feature_dict[cf.id] = cf

        sorted_features = sorted(feature_dict.values(), key=lambda x: (x.byte, x.bit))

        schema_export = {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "platform": base_schema.platform,
            "chassis_codes": base_schema.chassis_codes,
            "module_address": base_schema.module_address,
            "tx_header": base_schema.tx_header,
            "rx_filter": base_schema.rx_filter,
            "coding_did": base_schema.coding_did,
            "expected_byte_length": base_schema.expected_byte_length,
            "features": [f.model_dump() for f in sorted_features],
        }

        json_str = json.dumps(schema_export, indent=2)
        if output_path:
            p = Path(output_path)
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(json_str)
            logger.info("Exported GitHub community schema to %s", p)

        return json_str
