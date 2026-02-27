import json
from io import BytesIO

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app


def _make_wav_bytes() -> bytes:
    sr = 22050
    t = np.linspace(0, 1.2, int(sr * 1.2), endpoint=False)
    y = 0.2 * np.sin(2 * np.pi * 220 * t)
    buf = BytesIO()
    sf.write(buf, y, sr, format="WAV")
    return buf.getvalue()


def test_analyse_returns_400_when_api_key_missing(monkeypatch) -> None:
    monkeypatch.setenv("LLM_API_KEY", "")
    from app.config import get_settings

    get_settings.cache_clear()
    client = TestClient(app)

    response = client.post(
        "/analyse",
        files={"audio": ("sample.wav", _make_wav_bytes(), "audio/wav")},
    )

    assert response.status_code == 400


def test_analyse_returns_422_when_llm_non_json(monkeypatch) -> None:
    monkeypatch.setenv("LLM_API_KEY", "x-test")
    from app.config import get_settings

    get_settings.cache_clear()

    async def fake_non_json(**kwargs):
        return "not json"

    monkeypatch.setattr("app.main.call_llm_json", fake_non_json)
    client = TestClient(app)

    response = client.post(
        "/analyse",
        files={"audio": ("sample.wav", _make_wav_bytes(), "audio/wav")},
    )

    assert response.status_code == 422
    assert "raw_output" in response.json()


def test_analyse_returns_422_when_schema_invalid(monkeypatch) -> None:
    monkeypatch.setenv("LLM_API_KEY", "x-test")
    from app.config import get_settings

    get_settings.cache_clear()

    async def fake_bad_schema(**kwargs):
        return json.dumps({"summary": "x", "scores": {"overall": 5}, "observations": [], "next_steps": [], "warnings": []})

    monkeypatch.setattr("app.main.call_llm_json", fake_bad_schema)
    client = TestClient(app)

    response = client.post(
        "/analyse",
        files={"audio": ("sample.wav", _make_wav_bytes(), "audio/wav")},
    )

    assert response.status_code == 422
    assert "Schema validation failed" in response.json()["error"]


def test_analyse_returns_200_when_schema_valid(monkeypatch) -> None:
    monkeypatch.setenv("LLM_API_KEY", "x-test")
    from app.config import get_settings

    get_settings.cache_clear()

    valid_payload = {
        "summary": "Solid baseline performance with room for refinement.",
        "scores": {
            "pitch_stability": 7,
            "dynamic_control": 6,
            "timing_consistency": 7,
            "overall": 7,
        },
        "observations": [
            "Pitch remained mostly centered in voiced sections.",
            "Dynamics varied enough to avoid monotony.",
            "Timing was consistent across phrases.",
        ],
        "next_steps": [
            "Practice sustained notes with a reference tone.",
            "Use crescendos/decrescendos on short phrases.",
            "Record 2 takes and compare timing drift.",
        ],
        "warnings": [],
    }

    async def fake_valid(**kwargs):
        return json.dumps(valid_payload)

    monkeypatch.setattr("app.main.call_llm_json", fake_valid)
    client = TestClient(app)

    response = client.post(
        "/analyse",
        files={"audio": ("sample.wav", _make_wav_bytes(), "audio/wav")},
    )

    assert response.status_code == 200
    report = json.loads(response.json()["report"])
    assert report["scores"]["overall"] == 7
