import json
from pathlib import Path
from typing import Any


SCHEMA_DIR = Path(__file__).resolve().parent.parent / "schemas"
SCHEMA_PATH = SCHEMA_DIR / "vox_report.schema.json"
RAMBLE_NOTE_SCHEMA_PATH = SCHEMA_DIR / "ramble_note.schema.json"


def load_vox_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def load_ramble_note_schema() -> dict[str, Any]:
    return json.loads(RAMBLE_NOTE_SCHEMA_PATH.read_text(encoding="utf-8"))
