from __future__ import annotations

import httpx

from app.config import Settings


class TranscriptionError(RuntimeError):
    """Raised when a segment cannot be transcribed."""


async def transcribe(audio_bytes: bytes, filename: str, settings: Settings) -> str:
    """Turn one recorded segment into text.

    v0 note: this runs inline when a segment is uploaded. In production this
    would move to a background worker so the "Done" press has no work left to do.
    """
    if not audio_bytes:
        raise TranscriptionError("Segment audio is empty.")

    if settings.transcribe_stub:
        return f"[stub transcript · {filename} · {len(audio_bytes)} bytes]"

    if not settings.llm_api_key:
        raise TranscriptionError(
            "LLM_API_KEY is missing and TRANSCRIBE_STUB is false. "
            "Set a key or enable the stub."
        )

    return await _call_transcription(
        base_url=settings.llm_base_url,
        api_key=settings.llm_api_key,
        model=settings.transcribe_model,
        filename=filename,
        audio_bytes=audio_bytes,
    )


async def _call_transcription(
    base_url: str,
    api_key: str,
    model: str,
    filename: str,
    audio_bytes: bytes,
) -> str:
    url = f"{base_url.rstrip('/')}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {api_key}"}
    files = {
        "file": (filename, audio_bytes),
        "model": (None, model),
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, headers=headers, files=files)
        response.raise_for_status()

    data = response.json()
    text = data.get("text")
    if not isinstance(text, str):
        raise TranscriptionError("Transcription endpoint returned no text.")
    return text
