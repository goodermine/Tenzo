import json

from fastapi.testclient import TestClient


def _client(monkeypatch, tmp_path):
    monkeypatch.setenv("RAMBLBOX_DB_PATH", str(tmp_path / "ramblbox.db"))
    monkeypatch.setenv("TRANSCRIBE_STUB", "true")
    monkeypatch.setenv("LLM_API_KEY", "x-test")
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import app

    return TestClient(app)


def _valid_note() -> dict:
    return {
        "title": "Pricing + onboarding",
        "summary": "Leaning to $15/mo; onboarding needs a demo session.",
        "category": "build_priority",
        "decisions": [{"text": "Price at $15/mo to start."}],
        "action_items": [{"text": "Draft onboarding flow", "urgency": "high", "owner": "me"}],
        "open_questions": [{"text": "Annual discount?"}],
        "tags": ["pricing", "onboarding"],
        "warnings": [],
    }


def _seg(client, sid):
    return client.post(
        f"/session/{sid}/segment",
        files={"audio": ("seg.webm", b"fake-audio-bytes", "audio/webm")},
    )


def test_full_loop_capture_assimilate_reassimilate_archive(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    # Create session
    r = client.post("/session")
    assert r.status_code == 201
    sid = r.json()["id"]
    assert r.json()["status"] == "active"

    # Add two segments (stub transcription)
    assert _seg(client, sid).status_code == 201
    assert _seg(client, sid).status_code == 201

    session = client.get(f"/session/{sid}").json()
    assert len(session["segments"]) == 2
    assert session["segments"][0]["ord"] == 1

    # Assimilate (mock the LLM)
    async def fake_valid(**kwargs):
        return json.dumps(_valid_note())

    monkeypatch.setattr("app.ramblbox.routes.call_llm_json", fake_valid)

    r = client.post(f"/session/{sid}/assimilate")
    assert r.status_code == 200
    assert r.json()["version"] == 1
    assert r.json()["note"]["category"] == "build_priority"

    # Add another segment, re-assimilate -> version 2
    assert _seg(client, sid).status_code == 201
    r = client.post(f"/session/{sid}/assimilate")
    assert r.status_code == 200
    assert r.json()["version"] == 2

    # Archive seals the session
    r = client.post(f"/session/{sid}/archive")
    assert r.status_code == 200
    assert r.json()["status"] == "archived"

    # Post-archive: no new segments, no re-assimilation
    assert _seg(client, sid).status_code == 409
    assert client.post(f"/session/{sid}/assimilate").status_code == 409


def test_assimilate_with_no_segments_is_400(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    assert client.post(f"/session/{sid}/assimilate").status_code == 400


def test_delete_segment_reorders_view(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    _seg(client, sid)
    seg2_id = _seg(client, sid).json()["id"]

    r = client.delete(f"/session/{sid}/segment/{seg2_id}")
    assert r.status_code == 200
    assert len(r.json()["segments"]) == 1


def test_unknown_session_is_404(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    assert client.get("/session/deadbeef").status_code == 404


def test_list_sessions_shows_note_title(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    _seg(client, sid)

    async def fake_valid(**kwargs):
        return json.dumps(_valid_note())

    monkeypatch.setattr("app.ramblbox.routes.call_llm_json", fake_valid)
    client.post(f"/session/{sid}/assimilate")

    listing = client.get("/sessions").json()
    assert len(listing) == 1
    assert listing[0]["id"] == sid
    assert listing[0]["segment_count"] == 1
    assert listing[0]["note_version"] == 1
    assert listing[0]["note_title"] == "Pricing + onboarding"


def test_assimilate_rejects_invalid_schema(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    _seg(client, sid)

    async def fake_bad(**kwargs):
        return json.dumps({"title": "x"})  # missing required fields

    monkeypatch.setattr("app.ramblbox.routes.call_llm_json", fake_bad)
    r = client.post(f"/session/{sid}/assimilate")
    assert r.status_code == 422
    assert "Schema validation failed" in r.json()["error"]
