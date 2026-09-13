"""
SQLite storage manager for mandatory timestamped factory backups and offline schema caching.
"""

from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class CodingBackup:
    id: int
    timestamp: str
    vin: str
    module_address: str
    did: str
    raw_hex_data: str


DEFAULT_DB_DIR = Path.home() / ".vibesodb2"
DEFAULT_DB_PATH = DEFAULT_DB_DIR / "backups.db"


class StorageManager:
    """
    Manages local SQLite database for zero-touch backups and offline schema caching.
    """

    def __init__(self, db_path: Optional[str | Path] = None):
        if db_path is None:
            DEFAULT_DB_DIR.mkdir(parents=True, exist_ok=True)
            self.db_path = str(DEFAULT_DB_PATH)
        else:
            self.db_path = str(db_path)
            Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)

        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS coding_backups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    vin TEXT NOT NULL,
                    module_address TEXT NOT NULL,
                    did TEXT NOT NULL,
                    raw_hex_data TEXT NOT NULL
                );
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS cached_schemas (
                    platform TEXT NOT NULL,
                    module_address TEXT NOT NULL,
                    etag TEXT,
                    schema_json TEXT NOT NULL,
                    last_synced DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (platform, module_address)
                );
            """)
            conn.commit()

    def save_backup(
        self,
        vin: str,
        module_address: str,
        did: str,
        raw_hex_data: str,
        timestamp: Optional[str] = None,
    ) -> int:
        """
        Captures an immutable snapshot of raw ECU configuration before a write operation.
        Returns the inserted backup ID.
        """
        ts = timestamp or datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO coding_backups (timestamp, vin, module_address, did, raw_hex_data)
                VALUES (?, ?, ?, ?, ?)
                """,
                (ts, vin.strip(), module_address.strip(), did.strip(), raw_hex_data.strip().upper()),
            )
            conn.commit()
            return cursor.lastrowid

    def list_backups(
        self,
        module_address: Optional[str] = None,
        vin: Optional[str] = None,
    ) -> List[CodingBackup]:
        """Lists all snapshots, optionally filtered by module or VIN."""
        query = "SELECT id, timestamp, vin, module_address, did, raw_hex_data FROM coding_backups"
        params: List[Any] = []
        conditions = []

        if module_address:
            conditions.append("module_address = ?")
            params.append(module_address.strip())
        if vin:
            conditions.append("vin = ?")
            params.append(vin.strip())

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY id DESC"

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [
                CodingBackup(
                    id=row["id"],
                    timestamp=row["timestamp"],
                    vin=row["vin"],
                    module_address=row["module_address"],
                    did=row["did"],
                    raw_hex_data=row["raw_hex_data"],
                )
                for row in rows
            ]

    def get_backup_by_id(self, backup_id: int) -> Optional[CodingBackup]:
        """Retrieves a specific backup by ID."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, timestamp, vin, module_address, did, raw_hex_data FROM coding_backups WHERE id = ?",
                (backup_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return CodingBackup(
                id=row["id"],
                timestamp=row["timestamp"],
                vin=row["vin"],
                module_address=row["module_address"],
                did=row["did"],
                raw_hex_data=row["raw_hex_data"],
            )

    def get_latest_backup(self, module_address: str, vin: Optional[str] = None) -> Optional[CodingBackup]:
        """Retrieves the most recent backup for a given module."""
        backups = self.list_backups(module_address=module_address, vin=vin)
        return backups[0] if backups else None

    def save_cached_schema(
        self,
        platform: str,
        module_address: str,
        etag: Optional[str],
        schema_json: str,
    ) -> None:
        """Stores or updates a remote schema in local offline cache."""
        now = datetime.now(timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO cached_schemas (platform, module_address, etag, schema_json, last_synced)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(platform, module_address) DO UPDATE SET
                    etag=excluded.etag,
                    schema_json=excluded.schema_json,
                    last_synced=excluded.last_synced
                """,
                (platform, module_address, etag, schema_json, now),
            )
            conn.commit()

    def get_cached_schema(self, platform: str, module_address: str) -> Optional[Dict[str, Any]]:
        """Retrieves a cached schema from local SQLite database."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT platform, module_address, etag, schema_json, last_synced FROM cached_schemas WHERE platform = ? AND module_address = ?",
                (platform, module_address),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "platform": row["platform"],
                "module_address": row["module_address"],
                "etag": row["etag"],
                "schema_json": row["schema_json"],
                "last_synced": row["last_synced"],
            }
