import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import import_to_ramblbox as importer  # noqa: E402


def _client(monkeypatch, tmp_path):
    monkeypatch.setenv("RAMBLBOX_DB_PATH", str(tmp_path / "ramblbox.db"))
    monkeypatch.setenv("RAMBLBOX_AUDIO_DIR", str(tmp_path / "audio"))
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import app

    return TestClient(app, base_url="http://test")


def _write_manifest(tmp_path, groups: list[list[str]]) -> Path:
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps({"sessions": [{"files": g} for g in groups]}), encoding="utf-8")
    return path


def _make_audio_files(base_dir: Path, names: list[str]) -> None:
    base_dir.mkdir(parents=True, exist_ok=True)
    for name in names:
        (base_dir / name).write_bytes(b"fake-audio-bytes-" + name.encode())


def test_load_manifest_groups_files(tmp_path):
    path = _write_manifest(
        tmp_path,
        [["a.wav", "b.wav"], ["c.wav"]],
    )
    groups = importer.load_manifest(path)
    assert groups == [["a.wav", "b.wav"], ["c.wav"]]


def test_load_manifest_rejects_empty_or_missing_files(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"sessions": []}), encoding="utf-8")
    try:
        importer.load_manifest(bad)
        assert False, "expected ValueError"
    except ValueError:
        pass

    bad2 = tmp_path / "bad2.json"
    bad2.write_text(json.dumps({"sessions": [{"files": []}]}), encoding="utf-8")
    try:
        importer.load_manifest(bad2)
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_import_two_grouped_sessions_marks_done(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    audio_dir = tmp_path / "incoming"
    _make_audio_files(
        audio_dir,
        ["ramble_a1.wav", "ramble_a2.wav", "checkin.wav"],
    )
    groups = [["ramble_a1.wav", "ramble_a2.wav"], ["checkin.wav"]]

    results = importer.import_sessions(client, audio_dir, groups, mark_done=True)

    assert len(results) == 2
    assert all("error" not in r for r in results)
    assert results[0]["segments"] == 2
    assert results[0]["status"] == "ready"
    assert results[1]["segments"] == 1

    # Verify against the real app state, not just the script's own report.
    for r in results:
        session = client.get(f"/session/{r['session_id']}").json()
        assert session["status"] == "ready"
        assert len(session["segments"]) == r["segments"]
        # Segment order preserved.
        assert [s["ord"] for s in session["segments"]] == list(range(1, r["segments"] + 1))

    pending = client.get("/agent/pending").json()
    assert len(pending) == 2


def test_import_no_done_leaves_session_active(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    audio_dir = tmp_path / "incoming"
    _make_audio_files(audio_dir, ["solo.wav"])

    results = importer.import_sessions(client, audio_dir, [["solo.wav"]], mark_done=False)

    assert results[0]["status"] == "active"
    session = client.get(f"/session/{results[0]['session_id']}").json()
    assert session["status"] == "active"
    assert client.get("/agent/pending").json() == []


def test_import_reports_missing_file_without_aborting_other_sessions(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    audio_dir = tmp_path / "incoming"
    _make_audio_files(audio_dir, ["present.wav"])

    groups = [["missing.wav"], ["present.wav"]]
    results = importer.import_sessions(client, audio_dir, groups, mark_done=True)

    assert "error" in results[0]
    assert "missing.wav" in results[0]["error"]
    assert "error" not in results[1]
    assert results[1]["segments"] == 1
