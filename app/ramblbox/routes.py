from __future__ import annotations

import json

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from jsonschema import ValidationError, validate

from app.config import get_settings
from app.llm.openai_compat import call_llm_json
from app.ramblbox.store import (
    STATUS_ACTIVE,
    STATUS_ARCHIVED,
    STATUS_ASSIMILATED,
    STATUS_READY,
    SessionStore,
)
from app.ramblbox.transcribe import TranscriptionError, transcribe
from app.schemas import load_ramble_note_schema

router = APIRouter(prefix="/session", tags=["ramblbox"])
# Collection + agent endpoints live outside the /session/{id} prefix.
list_router = APIRouter(tags=["ramblbox"])
agent_router = APIRouter(prefix="/agent", tags=["ramblbox-agent"])

ASSIMILATE_SYSTEM_PROMPT = """You are Ramblbox, an assistant for a solo founder \
thinking out loud across several recorded segments in one session.
You receive the segment transcripts in order. Treat them as one continuous train \
of thought: the founder may refine, contradict, or answer their own earlier points \
across segments. Assimilate the WHOLE session into a single structured note.
Return ONLY valid JSON matching the provided JSON Schema.
Do not include markdown, code fences, or explanatory text.
Do not invent facts. If something is ambiguous or was left unresolved, capture it \
in open_questions or warnings rather than guessing.
"""


def get_store() -> SessionStore:
    return SessionStore(get_settings().ramblbox_db_path)


def _require_session(store: SessionStore, session_id: str) -> dict:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


def _stitch(segments: list[dict]) -> str:
    return "\n\n".join(
        f"--- Segment {seg['ord']} ({seg['filename']}) ---\n{seg['transcript']}"
        for seg in segments
    )


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


@list_router.get("/sessions")
async def list_sessions(limit: int = 50) -> JSONResponse:
    store = get_store()
    return JSONResponse(status_code=200, content=store.list_sessions(limit=limit))


@router.post("")
async def create_session() -> JSONResponse:
    store = get_store()
    session = store.create_session()
    return JSONResponse(status_code=201, content=session)


@router.get("/{session_id}")
async def read_session(session_id: str) -> JSONResponse:
    store = get_store()
    session = _require_session(store, session_id)
    session["stitched_transcript"] = _stitch(session["segments"])
    return JSONResponse(status_code=200, content=session)


@router.post("/{session_id}/segment")
async def add_segment(session_id: str, audio: UploadFile = File(...)) -> JSONResponse:
    store = get_store()
    session = _require_session(store, session_id)
    if session["status"] == STATUS_ARCHIVED:
        raise HTTPException(status_code=409, detail="Session is archived; cannot add segments.")

    settings = get_settings()
    audio_bytes = await audio.read()
    filename = audio.filename or "segment"

    try:
        transcript = await transcribe(audio_bytes, filename, settings)
    except TranscriptionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - surface ASR/network failures to the client
        raise HTTPException(status_code=502, detail=f"Transcription failed: {exc}") from exc

    segment = store.add_segment(session_id, filename, transcript)
    # New audio means the note (if any) is now stale — back to active.
    if session["status"] != STATUS_ACTIVE:
        store.set_status(session_id, STATUS_ACTIVE)
    return JSONResponse(status_code=201, content=segment)


@router.delete("/{session_id}/segment/{segment_id}")
async def delete_segment(session_id: str, segment_id: str) -> JSONResponse:
    store = get_store()
    session = _require_session(store, session_id)
    if session["status"] == STATUS_ARCHIVED:
        raise HTTPException(status_code=409, detail="Session is archived; cannot edit segments.")

    if not store.delete_segment(session_id, segment_id):
        raise HTTPException(status_code=404, detail="Segment not found.")
    return JSONResponse(status_code=200, content=store.get_session(session_id))


@router.post("/{session_id}/done")
async def mark_done(session_id: str) -> JSONResponse:
    """Human presses Done: queue the session for the agent to assimilate.

    This does NOT call any LLM. The agent picks it up via GET /agent/pending
    and writes the note back via POST /session/{id}/note.
    """
    store = get_store()
    session = _require_session(store, session_id)
    if session["status"] == STATUS_ARCHIVED:
        raise HTTPException(status_code=409, detail="Session is archived.")
    if not session["segments"]:
        raise HTTPException(status_code=400, detail="No segments to assimilate.")
    store.set_status(session_id, STATUS_READY)
    return JSONResponse(status_code=200, content=store.get_session(session_id))


@router.post("/{session_id}/note")
async def submit_note(session_id: str, note: dict) -> JSONResponse:
    """The agent submits a structured note for a session.

    Body is the ramble_note JSON. It is schema-validated, stored (versioned),
    and the session moves to 'assimilated'. Re-submitting bumps the version
    until the session is archived.
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


@agent_router.get("/pending")
async def agent_pending(limit: int = 20) -> JSONResponse:
    """Queue for the agent: sessions where Done was pressed but no note written yet.

    Each item includes the stitched transcript so the agent can assimilate in one
    read and POST the result to /session/{id}/note.
    """
    store = get_store()
    pending = []
    for row in store.list_sessions(limit=limit, status=STATUS_READY):
        full = store.get_session(row["id"])
        if full is None:
            continue
        pending.append(
            {
                "session_id": full["id"],
                "created_at": full["created_at"],
                "segment_count": len(full["segments"]),
                "stitched_transcript": _stitch(full["segments"]),
                "note_schema": load_ramble_note_schema(),
            }
        )
    return JSONResponse(status_code=200, content=pending)


@router.post("/{session_id}/assimilate")
async def assimilate(session_id: str) -> JSONResponse:
    """Optional fallback: assimilate directly via a configured LLM API key.

    The default flow is agent-driven (Done -> agent -> note). This endpoint only
    works if LLM_API_KEY is set, for testing or a push-button alternative.
    """
    store = get_store()
    session = _require_session(store, session_id)
    if session["status"] == STATUS_ARCHIVED:
        raise HTTPException(
            status_code=409,
            detail="Session is archived; re-assimilation is disabled.",
        )

    segments = session["segments"]
    if not segments:
        raise HTTPException(status_code=400, detail="No segments to assimilate.")

    settings = get_settings()
    if not settings.llm_api_key:
        raise HTTPException(
            status_code=400,
            detail="LLM_API_KEY is missing. Copy .env.example to .env and set LLM_API_KEY.",
        )

    schema = load_ramble_note_schema()
    stitched = _stitch(segments)

    prompt = {
        "schema": schema,
        "session_transcript": stitched,
        "instruction": "Produce strict JSON only, assimilating the whole session.",
    }

    try:
        raw_output = await call_llm_json(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            system=ASSIMILATE_SYSTEM_PROMPT,
            user=json.dumps(prompt, ensure_ascii=False),
            temperature=0.3,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc

    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError as exc:
        return JSONResponse(
            status_code=422,
            content={"error": f"LLM returned non-JSON output: {exc}", "raw_output": raw_output},
        )

    try:
        validate(instance=parsed, schema=schema)
    except ValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={"error": f"Schema validation failed: {exc.message}", "raw_output": raw_output},
        )

    version = store.save_note(session_id, json.dumps(parsed, ensure_ascii=False))
    store.set_status(session_id, STATUS_ASSIMILATED)
    return JSONResponse(
        status_code=200,
        content={
            "session_id": session_id,
            "version": version,
            "note": parsed,
            "status": STATUS_ASSIMILATED,
        },
    )


@router.post("/{session_id}/archive")
async def archive_session(session_id: str) -> JSONResponse:
    store = get_store()
    _require_session(store, session_id)
    store.set_status(session_id, STATUS_ARCHIVED)
    return JSONResponse(status_code=200, content=store.get_session(session_id))
