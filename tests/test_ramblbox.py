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


def test_agent_loop_done_pending_note_reassimilate_archive(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    # Create session + two segments
    sid = client.post("/session").json()["id"]
    assert _seg(client, sid).status_code == 201
    assert _seg(client, sid).status_code == 201

    # Done queues it for the agent (no LLM involved)
    r = client.post(f"/session/{sid}/done")
    assert r.status_code == 200
    assert r.json()["status"] == "ready"

    # Agent sees it in the pending queue with the stitched transcript + schema
    pending = client.get("/agent/pending").json()
    assert len(pending) == 1
    assert pending[0]["session_id"] == sid
    assert "Segment 1" in pending[0]["stitched_transcript"]
    assert pending[0]["note_schema"]["title"] == "Ramblbox Session Note"

    # Agent submits a structured note -> version 1, status assimilated, queue empties
    r = client.post(f"/session/{sid}/note", json=_valid_note())
    assert r.status_code == 200
    assert r.json()["version"] == 1
    assert r.json()["status"] == "assimilated"
    assert client.get("/agent/pending").json() == []

    # Add another segment -> back to active; Done -> ready again; new note -> version 2
    assert _seg(client, sid).status_code == 201
    assert client.get(f"/session/{sid}").json()["status"] == "active"
    client.post(f"/session/{sid}/done")
    r = client.post(f"/session/{sid}/note", json=_valid_note())
    assert r.json()["version"] == 2

    # Archive seals: no segments, no done, no note
    assert client.post(f"/session/{sid}/archive").json()["status"] == "archived"
    assert _seg(client, sid).status_code == 409
    assert client.post(f"/session/{sid}/done").status_code == 409
    assert client.post(f"/session/{sid}/note", json=_valid_note()).status_code == 409


def test_submit_note_rejects_invalid_schema(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    _seg(client, sid)
    r = client.post(f"/session/{sid}/note", json={"title": "x"})  # missing required fields
    assert r.status_code == 422
    assert "Schema validation failed" in r.json()["error"]


def test_done_with_no_segments_is_400(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    assert client.post(f"/session/{sid}/done").status_code == 400


def test_optional_direct_assimilate_still_works(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    _seg(client, sid)

    async def fake_valid(**kwargs):
        return json.dumps(_valid_note())

    monkeypatch.setattr("app.ramblbox.routes.call_llm_json", fake_valid)
    r = client.post(f"/session/{sid}/assimilate")
    assert r.status_code == 200
    assert r.json()["status"] == "assimilated"


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
