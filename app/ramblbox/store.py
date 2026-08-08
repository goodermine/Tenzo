from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

# Session lifecycle:
#   active   -> can append segments, can (re)assimilate
#   archived -> sealed; no more segments, no more assimilation
STATUS_ACTIVE = "active"
STATUS_ARCHIVED = "archived"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return uuid.uuid4().hex


class SessionStore:
    """Minimal SQLite-backed store for Ramblbox capture sessions.

    A fresh connection is opened per operation so the store is safe to use from
    FastAPI's threadpool without connection-sharing headaches. This is a v0
    stub, not a production data layer.
    """

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    id         TEXT PRIMARY KEY,
                    status     TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS segments (
                    id         TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    ord        INTEGER NOT NULL,
                    filename   TEXT NOT NULL,
                    transcript TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS notes (
                    id         TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    version    INTEGER NOT NULL,
                    note_json  TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )

    # --- sessions ---------------------------------------------------------
    def create_session(self) -> dict[str, Any]:
        sid = _new_id()
        ts = _now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO sessions (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (sid, STATUS_ACTIVE, ts, ts),
            )
        return self.get_session(sid)  # type: ignore[return-value]

    def get_session(self, session_id: str) -> Optional[dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ).fetchone()
        if row is None:
            return None
        session = dict(row)
        session["segments"] = self.list_segments(session_id)
        session["note"] = self.get_latest_note(session_id)
        return session

    def list_sessions(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT s.id, s.status, s.created_at, s.updated_at, "
                "COUNT(seg.id) AS segment_count "
                "FROM sessions s LEFT JOIN segments seg ON seg.session_id = s.id "
                "GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        sessions = []
        for row in rows:
            item = dict(row)
            note = self.get_latest_note(item["id"])
            title = None
            if note is not None:
                try:
                    title = json.loads(note["note_json"]).get("title")
                except (json.JSONDecodeError, AttributeError):
                    title = None
            item["note_version"] = note["version"] if note else 0
            item["note_title"] = title
            sessions.append(item)
        return sessions

    def set_status(self, session_id: str, status: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?",
                (status, _now(), session_id),
            )

    def _touch(self, conn: sqlite3.Connection, session_id: str) -> None:
        conn.execute(
            "UPDATE sessions SET updated_at = ? WHERE id = ?", (_now(), session_id)
        )

    # --- segments ---------------------------------------------------------
    def add_segment(self, session_id: str, filename: str, transcript: str) -> dict[str, Any]:
        seg_id = _new_id()
        ts = _now()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(ord), 0) AS max_ord FROM segments WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            ord_ = int(row["max_ord"]) + 1
            conn.execute(
                "INSERT INTO segments (id, session_id, ord, filename, transcript, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (seg_id, session_id, ord_, filename, transcript, ts),
            )
            self._touch(conn, session_id)
        return {
            "id": seg_id,
            "session_id": session_id,
            "ord": ord_,
            "filename": filename,
            "transcript": transcript,
            "created_at": ts,
        }

    def list_segments(self, session_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM segments WHERE session_id = ? ORDER BY ord ASC",
                (session_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def delete_segment(self, session_id: str, segment_id: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "DELETE FROM segments WHERE session_id = ? AND id = ?",
                (session_id, segment_id),
            )
            self._touch(conn, session_id)
            return cur.rowcount > 0

    # --- notes ------------------------------------------------------------
    def save_note(self, session_id: str, note_json: str) -> int:
        ts = _now()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(version), 0) AS max_v FROM notes WHERE session_id = ?",
                (session_id,),
            ).fetchone()
            version = int(row["max_v"]) + 1
            conn.execute(
                "INSERT INTO notes (id, session_id, version, note_json, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (_new_id(), session_id, version, note_json, ts),
            )
            self._touch(conn, session_id)
        return version

    def get_latest_note(self, session_id: str) -> Optional[dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT version, note_json, created_at FROM notes "
                "WHERE session_id = ? ORDER BY version DESC LIMIT 1",
                (session_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "version": int(row["version"]),
            "note_json": row["note_json"],
            "created_at": row["created_at"],
        }
