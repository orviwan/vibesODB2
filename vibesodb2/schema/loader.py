"""
Schema loader with offline-first SQLite caching, custom user overrides,
and remote repository synchronization.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional
import httpx

from vibesodb2.safety.storage import StorageManager
from vibesodb2.schema.custom import CustomSchemaManager
from vibesodb2.schema.models import ModuleSchema, VehicleFeature

logger = logging.getLogger(__name__)

DEFINITIONS_DIR = Path(__file__).parent / "definitions"
REMOTE_SCHEMA_BASE_URL = (
    "https://raw.githubusercontent.com/vibesodb2/schemas/main/definitions"
)


class SchemaLoader:
    """
    Manages loading, validation, local caching, user overrides, and remote syncing of vehicle schemas.
    """

    def __init__(self, storage: Optional[StorageManager] = None):
        self.storage = storage or StorageManager()
        self.custom_manager = CustomSchemaManager()
        self._memory_cache: Dict[str, ModuleSchema] = {}
        self._load_bundled_schemas()

    def _normalize_key(self, platform: str, module_address: str | int) -> str:
        if isinstance(module_address, int):
            mod_str = f"0x{module_address:02X}".upper()
        else:
            mod_str = module_address.upper()
            if not mod_str.startswith("0X"):
                mod_str = f"0X{int(mod_str, 16):02X}"

        plat = platform.upper().strip()
        if plat == "PQ25":
            plat = "PQ25_T51"
        return f"{plat}_{mod_str}"

    def _load_bundled_schemas(self) -> None:
        """Loads bundled JSON schema files into memory and caches them into SQLite."""
        if not DEFINITIONS_DIR.exists():
            logger.warning("Bundled definitions directory not found: %s", DEFINITIONS_DIR)
            return

        for json_file in DEFINITIONS_DIR.glob("*.json"):
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    schema = ModuleSchema(**data)
                    key = self._normalize_key(schema.platform, schema.module_address)
                    self._memory_cache[key] = schema
                    # Cache to SQLite
                    self.storage.save_cached_schema(
                        platform=schema.platform,
                        module_address=schema.module_address,
                        etag=None,
                        schema_json=json.dumps(data),
                    )
            except Exception as e:
                logger.error("Failed to parse bundled schema %s: %s", json_file.name, e)

    def get_schema(
        self,
        module_address: int | str,
        platform: str = "PQ25_T51",
    ) -> Optional[ModuleSchema]:
        """
        Retrieves a schema for the specified module and platform.
        Checks in-memory cache, SQLite cache, and merges user custom features.
        """
        key = self._normalize_key(platform, module_address)
        base_schema: Optional[ModuleSchema] = None

        if key in self._memory_cache:
            base_schema = self._memory_cache[key]
        else:
            # Check SQLite
            mod_str = f"0x{module_address:02X}" if isinstance(module_address, int) else module_address
            plat_clean = platform.upper()
            if plat_clean == "PQ25":
                plat_clean = "PQ25_T51"

            cached = self.storage.get_cached_schema(plat_clean, mod_str)
            if cached and cached.get("schema_json"):
                try:
                    schema_dict = json.loads(cached["schema_json"])
                    base_schema = ModuleSchema(**schema_dict)
                    self._memory_cache[key] = base_schema
                except Exception as e:
                    logger.warning("Error parsing SQLite cached schema for %s: %s", key, e)

        if not base_schema:
            return None

        # Merge user custom overrides
        custom_features = self.custom_manager.list_custom_features(platform, module_address)
        if not custom_features:
            return base_schema

        feature_map = {f.id: f for f in base_schema.features}
        for cf in custom_features:
            feature_map[cf.id] = cf

        merged_features = sorted(feature_map.values(), key=lambda x: (x.byte, x.bit))
        return base_schema.model_copy(update={"features": merged_features})

    def list_schemas(self) -> List[ModuleSchema]:
        """Returns all loaded schemas."""
        return list(self._memory_cache.values())

    def add_custom_feature(
        self,
        platform: str,
        module_address: str | int,
        feature: VehicleFeature,
    ) -> None:
        """Saves a user custom feature setting to disk and invalidates memory cache."""
        self.custom_manager.add_custom_feature(platform, module_address, feature)
        # Clear memory cache for this key so it re-merges on next get_schema
        key = self._normalize_key(platform, module_address)
        self._memory_cache.pop(key, None)

    def export_community_schema(
        self,
        platform: str,
        module_address: str | int,
        output_path: Optional[Path | str] = None,
    ) -> str:
        """Exports a merged, GitHub PR ready JSON schema file."""
        schema = self.get_schema(module_address, platform)
        if not schema:
            raise KeyError(f"No schema found for platform {platform} module {module_address}")
        return self.custom_manager.export_for_github(schema, output_path)

    async def sync_remote_schema(
        self,
        platform: str,
        module_address: str,
        timeout: float = 5.0,
    ) -> Optional[ModuleSchema]:
        """
        Syncs schema with remote GitHub CDN using conditional ETag headers.
        Falls back safely to local cache on network error or HTTP 304.
        """
        mod_clean = module_address.lower().replace("0x", "")
        remote_url = f"{REMOTE_SCHEMA_BASE_URL}/{platform.lower()}_0x{mod_clean}.json"

        cached = self.storage.get_cached_schema(platform, module_address)
        headers = {}
        if cached and cached.get("etag"):
            headers["If-None-Match"] = cached["etag"]

        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.get(remote_url, headers=headers)
                if response.status_code == 304:
                    logger.info("Schema %s up to date (HTTP 304).", module_address)
                    return self.get_schema(module_address, platform)
                elif response.status_code == 200:
                    data = response.json()
                    schema = ModuleSchema(**data)
                    new_etag = response.headers.get("etag")
                    self.storage.save_cached_schema(
                        platform=platform,
                        module_address=module_address,
                        etag=new_etag,
                        schema_json=response.text,
                    )
                    key = self._normalize_key(platform, module_address)
                    self._memory_cache[key] = schema
                    logger.info("Schema %s updated from remote CDN.", module_address)
                    return schema
        except Exception as e:
            logger.debug("Remote schema sync skipped (%s). Using local cache.", e)

        return self.get_schema(module_address, platform)
