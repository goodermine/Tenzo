from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from jsonschema import ValidationError, validate

from app.config import get_settings
from app.ramblbox.notify import notify_agent, notify_telegram
from app.ramblbox.store import (
    STATUS_ACTIVE,
    STATUS_ARCHIVED,
    STATUS_ASSIMILATED,
    STATUS_READY,
    SessionStore,
)
from app.schemas import load_ramble_note_schema

router = APIRouter(prefix="/session", tags=["ramblbox"])
# Collection + agent endpoints live outside the /session/{id} prefix.
list_router = APIRouter(tags=["ramblbox"])
agent_router = APIRouter(prefix="/agent", tags=["ramblbox-agent"])


def get_store() -> SessionStore:
    return SessionStore(get_settings().ramblbox_db_path)


def _require_session(store: SessionStore, session_id: str) -> dict:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


def _audio_url(session_id: str, segment_id: str) -> str:
    return f"/session/{session_id}/segment/{segment_id}/audio"


def _abs(request: Request, path: str) -> str:
    return str(request.base_url).rstrip("/") + path


def _serialize_segment(seg: dict) -> dict:
    """Public view of a segment — no on-disk path leaked, adds an audio URL."""
    return {
        "id": seg["id"],
        "session_id": seg["session_id"],
        "ord": seg["ord"],
        "filename": seg["filename"],
        "mime_type": seg["mime_type"],
        "size_bytes": seg["size_bytes"],
        "created_at": seg["created_at"],
        "audio_url": _audio_url(seg["session_id"], seg["id"]),
    }


def _serialize_session(session: dict) -> dict:
    session = dict(session)
    session["segments"] = [_serialize_segment(s) for s in session["segments"]]
    return session


def _validate_note(parsed: object) -> object | JSONResponse:
    schema = load_ramble_note_schema()
    try:
        validate(instance=parsed, schema=schema)
    except ValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={"error": f"Schema validation failed: {exc.message}"},
        )
    return parsed


def _ready_payload(request: Request, session: dict) -> dict:
    """Everything the agent needs to assimilate a ready session."""
    sid = session["id"]
    return {
        "event": "session_ready",
        "session_id": sid,
        "created_at": session["created_at"],
        "segments": [
            {
                "ord": s["ord"],
                "filename": s["filename"],
                "mime_type": s["mime_type"],
                "audio_url": _abs(request, _audio_url(sid, s["id"])),
            }
            for s in session["segments"]
        ],
        "note_endpoint": _abs(request, f"/session/{sid}/note"),
        "note_schema": load_ramble_note_schema(),
    }


@list_router.get("/sessions")
async def list_sessions(limit: int = 50) -> JSONResponse:
    store = get_store()
    return JSONResponse(status_code=200, content=store.list_sessions(limit=limit))


@router.post("")
async def create_session() -> JSONResponse:
    store = get_store()
    session = store.create_session()
    return JSONResponse(status_code=201, content=_serialize_session(session))


@router.get("/{session_id}")
async def read_session(session_id: str) -> JSONResponse:
    store = get_store()
    session = _require_session(store, session_id)
    return JSONResponse(status_code=200, content=_serialize_session(session))


@router.post("/{session_id}/segment")
async def add_segment(session_id: str, audio: UploadFile = File(...)) -> JSONResponse:
    store = get_store()
    session = _require_session(store, session_id)
    if session["status"] == STATUS_ARCHIVED:
        raise HTTPException(status_code=409, detail="Session is archived; cannot add segments.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Segment audio is empty.")

    settings = get_settings()
    audio_dir = Path(settings.ramblbox_audio_dir)
    audio_dir.mkdir(parents=True, exist_ok=True)

    segment_id = uuid.uuid4().hex
    filename = audio.filename or "segment.webm"
    ext = os.path.splitext(filename)[1] or ".webm"
    audio_path = str(audio_dir / f"{segment_id}{ext}")
    with open(audio_path, "wb") as fh:
        fh.write(audio_bytes)

    segment = store.add_segment(
        session_id=session_id,
        segment_id=segment_id,
        filename=filename,
        audio_path=audio_path,
        mime_type=audio.content_type or "audio/webm",
        size_bytes=len(audio_bytes),
    )
    # New audio means any existing note is stale — back to active.
    if session["status"] != STATUS_ACTIVE:
        store.set_status(session_id, STATUS_ACTIVE)
    return JSONResponse(status_code=201, content=_serialize_segment(segment))


@router.get("/{session_id}/segment/{segment_id}/audio")
async def get_segment_audio(session_id: str, segment_id: str) -> FileResponse:
    store = get_store()
    seg = store.get_segment(session_id, segment_id)
    if seg is None or not os.path.exists(seg["audio_path"]):
        raise HTTPException(status_code=404, detail="Segment audio not found.")
    return FileResponse(seg["audio_path"], media_type=seg["mime_type"], filename=seg["filename"])


@router.delete("/{session_id}/segment/{segment_id}")
async def delete_segment(session_id: str, segment_id: str) -> JSONResponse:
    store = get_store()
    session = _require_session(store, session_id)
    if session["status"] == STATUS_ARCHIVED:
        raise HTTPException(status_code=409, detail="Session is archived; cannot edit segments.")

    seg = store.delete_segment(session_id, segment_id)
    if seg is None:
        raise HTTPException(status_code=404, detail="Segment not found.")
    try:
        os.remove(seg["audio_path"])
    except OSError:
        pass
    return JSONResponse(status_code=200, content=_serialize_session(store.get_session(session_id)))


@router.post("/{session_id}/done")
async def mark_done(session_id: str, request: Request) -> JSONResponse:
    """Human presses Done: queue the session and push a notification to the agent.

    No LLM/transcription happens here. The agent transcribes the segment audio and
    writes the note back via POST /session/{id}/note. If the webhook fails or is not
    configured, the session still sits in /agent/pending for polling.
    """
    store = get_store()
    session = _require_session(store, session_id)
    if session["status"] == STATUS_ARCHIVED:
        raise HTTPException(status_code=409, detail="Session is archived.")
    if not session["segments"]:
        raise HTTPException(status_code=400, detail="No segments to assimilate.")

    store.set_status(session_id, STATUS_READY)
    session = store.get_session(session_id)
    settings = get_settings()
    payload = _ready_payload(request, session)

    webhook_ok = await notify_agent(settings.agent_webhook_url, payload)
    tg_text = (
        f"🎙️ Ramblbox: a session is ready to assimilate "
        f"({len(session['segments'])} segment(s)). Run the Ramblbox queue."
    )
    telegram_ok = await notify_telegram(
        settings.telegram_bot_token, settings.telegram_chat_id, tg_text
    )

    return JSONResponse(
        status_code=200,
        content={
            "session": _serialize_session(session),
            "notified": webhook_ok or telegram_ok,
            "channels": {"webhook": webhook_ok, "telegram": telegram_ok},
        },
    )


@router.post("/{session_id}/note")
async def submit_note(session_id: str, note: dict) -> JSONResponse:
    """The agent submits a structured note for a session.

    Body is the ramble_note JSON. Schema-validated, stored (versioned), and the
    session moves to 'assimilated'. Re-submitting bumps the version until archived.
    """
    store = get_store()
    session = _require_session(store, session_id)
    if session["status"] == STATUS_ARCHIVED:
        raise HTTPException(status_code=409, detail="Session is archived; notes are sealed.")

    validated = _validate_note(note)
    if isinstance(validated, JSONResponse):
        return validated

    version = store.save_note(session_id, json.dumps(validated, ensure_ascii=False))
    store.set_status(session_id, STATUS_ASSIMILATED)
    return JSONResponse(
        status_code=200,
        content={
            "session_id": session_id,
            "version": version,
            "note": validated,
            "status": STATUS_ASSIMILATED,
        },
    )


@router.post("/{session_id}/archive")
async def archive_session(session_id: str) -> JSONResponse:
    store = get_store()
    _require_session(store, session_id)
    store.set_status(session_id, STATUS_ARCHIVED)
    return JSONResponse(status_code=200, content=_serialize_session(store.get_session(session_id)))


@agent_router.get("/pending")
async def agent_pending(request: Request, limit: int = 20) -> JSONResponse:
    """Poll fallback: sessions where Done was pressed but no note is written yet.

    Same payload shape the webhook pushes, so the agent handles both identically.
    """
    store = get_store()
    pending = []
    for row in store.list_sessions(limit=limit, status=STATUS_READY):
        full = store.get_session(row["id"])
        if full is not None:
            pending.append(_ready_payload(request, full))
    return JSONResponse(status_code=200, content=pending)
