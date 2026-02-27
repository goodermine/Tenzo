import json
from pathlib import Path
from typing import Any


SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schemas" / "vox_report.schema.json"


def load_vox_schema() -> dict[str, Any]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
