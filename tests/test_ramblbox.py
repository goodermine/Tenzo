from fastapi.testclient import TestClient


def _client(monkeypatch, tmp_path):
    monkeypatch.setenv("RAMBLBOX_DB_PATH", str(tmp_path / "ramblbox.db"))
    monkeypatch.setenv("RAMBLBOX_AUDIO_DIR", str(tmp_path / "audio"))
    # AGENT_WEBHOOK_URL is left as the caller set it (default unset -> "").
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


def _seg(client, sid, data=b"fake-audio-bytes"):
    return client.post(
        f"/session/{sid}/segment",
        files={"audio": ("seg.webm", data, "audio/webm")},
    )


def test_agent_loop_done_pending_note_reassimilate_archive(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    sid = client.post("/session").json()["id"]
    r1 = _seg(client, sid)
    assert r1.status_code == 201
    assert r1.json()["audio_url"].endswith("/audio")
    assert "transcript" not in r1.json()
    assert _seg(client, sid).status_code == 201

    # Done queues it (no webhook configured -> notified False, still ready)
    r = client.post(f"/session/{sid}/done")
    assert r.status_code == 200
    assert r.json()["notified"] is False
    assert r.json()["session"]["status"] == "ready"

    # Agent queue: audio URLs + schema + where to post the note back
    pending = client.get("/agent/pending").json()
    assert len(pending) == 1
    assert pending[0]["session_id"] == sid
    assert len(pending[0]["segments"]) == 2
    assert pending[0]["segments"][0]["audio_url"].endswith("/audio")
    assert pending[0]["note_endpoint"].endswith(f"/session/{sid}/note")
    assert pending[0]["note_schema"]["title"] == "Ramblbox Session Note"

    # Agent submits the note -> version 1, assimilated, queue empties
    r = client.post(f"/session/{sid}/note", json=_valid_note())
    assert r.status_code == 200
    assert r.json()["version"] == 1
    assert r.json()["status"] == "assimilated"
    assert client.get("/agent/pending").json() == []

    # Add another segment -> back to active; Done -> ready; new note -> v2
    assert _seg(client, sid).status_code == 201
    assert client.get(f"/session/{sid}").json()["status"] == "active"
    client.post(f"/session/{sid}/done")
    assert client.post(f"/session/{sid}/note", json=_valid_note()).json()["version"] == 2

    # Archive seals everything
    assert client.post(f"/session/{sid}/archive").json()["status"] == "archived"
    assert _seg(client, sid).status_code == 409
    assert client.post(f"/session/{sid}/done").status_code == 409
    assert client.post(f"/session/{sid}/note", json=_valid_note()).status_code == 409


def test_segment_audio_is_stored_and_served(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    seg = _seg(client, sid, data=b"hello-audio").json()

    r = client.get(seg["audio_url"])
    assert r.status_code == 200
    assert r.content == b"hello-audio"


def test_delete_segment_removes_file(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    seg = _seg(client, sid).json()

    # File exists on disk after upload
    audio_dir = tmp_path / "audio"
    files_before = list(audio_dir.iterdir())
    assert len(files_before) == 1

    r = client.delete(f"/session/{sid}/segment/{seg['id']}")
    assert r.status_code == 200
    assert len(r.json()["segments"]) == 0
    assert list(audio_dir.iterdir()) == []


def test_done_fires_webhook_when_configured(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENT_WEBHOOK_URL", "http://agent.local/hook")
    client = _client(monkeypatch, tmp_path)  # clears settings cache again with the URL set
    sid = client.post("/session").json()["id"]
    _seg(client, sid)

    captured = {}

    async def fake_notify(url, payload):
        captured["url"] = url
        captured["payload"] = payload
        return True

    monkeypatch.setattr("app.ramblbox.routes.notify_agent", fake_notify)

    r = client.post(f"/session/{sid}/done")
    assert r.status_code == 200
    assert r.json()["notified"] is True
    assert captured["url"] == "http://agent.local/hook"
    assert captured["payload"]["event"] == "session_ready"
    assert captured["payload"]["session_id"] == sid
    assert captured["payload"]["segments"][0]["audio_url"].startswith("http")


def test_done_with_no_segments_is_400(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    assert client.post(f"/session/{sid}/done").status_code == 400


def test_submit_note_rejects_invalid_schema(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    _seg(client, sid)
    r = client.post(f"/session/{sid}/note", json={"title": "x"})
    assert r.status_code == 422
    assert "Schema validation failed" in r.json()["error"]


def test_unknown_session_is_404(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    assert client.get("/session/deadbeef").status_code == 404


def test_list_sessions_shows_note_title(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    sid = client.post("/session").json()["id"]
    _seg(client, sid)
    client.post(f"/session/{sid}/done")
    client.post(f"/session/{sid}/note", json=_valid_note())

    listing = client.get("/sessions").json()
    assert len(listing) == 1
    assert listing[0]["id"] == sid
    assert listing[0]["segment_count"] == 1
    assert listing[0]["note_version"] == 1
    assert listing[0]["note_title"] == "Pricing + onboarding"
