"""
Unit tests for Custom Settings Overrides and GitHub Community Schema Export.
"""

import json
import tempfile
from pathlib import Path
import pytest

from vibesodb2.schema.custom import CustomSchemaManager
from vibesodb2.schema.loader import SchemaLoader
from vibesodb2.schema.models import VehicleFeature


def test_custom_schema_add_and_list():
    with tempfile.TemporaryDirectory() as tmpdir:
        mgr = CustomSchemaManager(custom_dir=Path(tmpdir))

        feat = VehicleFeature(
            id="my_custom_drl_dimming",
            category="Custom DRL",
            byte=15,
            bit=7,
            name="Custom DRL Dimming Percentage",
            description="Dims DRLs when headlights are on.",
            prerequisites="None",
        )

        mgr.add_custom_feature("PQ25", "0x09", feat)
        loaded = mgr.list_custom_features("PQ25", "0x09")

        assert len(loaded) == 1
        assert loaded[0].id == "my_custom_drl_dimming"
        assert loaded[0].byte == 15
        assert loaded[0].bit == 7

        # Remove
        removed = mgr.remove_custom_feature("PQ25", "0x09", "my_custom_drl_dimming")
        assert removed is True
        assert len(mgr.list_custom_features("PQ25", "0x09")) == 0


def test_schema_loader_merges_custom_feature():
    with tempfile.TemporaryDirectory() as tmpdir:
        loader = SchemaLoader()
        loader.custom_manager = CustomSchemaManager(custom_dir=Path(tmpdir))

        # Add custom feature
        feat = VehicleFeature(
            id="test_custom_honk",
            category="Custom Horn",
            byte=1,
            bit=6,
            name="Test Horn Feature",
            description="Test description",
        )
        loader.add_custom_feature("PQ25", "0x09", feat)

        # Get merged schema
        schema = loader.get_schema(module_address="0x09", platform="PQ25")
        assert schema is not None
        custom_found = schema.get_feature("test_custom_honk")
        assert custom_found is not None
        assert custom_found.name == "Test Horn Feature"


def test_export_for_github_pr():
    with tempfile.TemporaryDirectory() as tmpdir:
        loader = SchemaLoader()
        loader.custom_manager = CustomSchemaManager(custom_dir=Path(tmpdir))

        feat = VehicleFeature(
            id="community_tested_feature",
            category="Lighting",
            byte=25,
            bit=3,
            name="Community Tested Feature",
            description="Reverse-engineered community setting.",
        )
        loader.add_custom_feature("PQ35", "0x09", feat)

        out_path = Path(tmpdir) / "export_pq35_0x09.json"
        exported_str = loader.export_community_schema("PQ35", "0x09", output_path=out_path)

        assert out_path.exists()
        data = json.loads(exported_str)
        assert data["platform"] == "PQ35"
        assert data["module_address"] == "0x09"
        # Check custom feature is included in the export
        assert any(f["id"] == "community_tested_feature" for f in data["features"])
