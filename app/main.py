from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse
from jsonschema import ValidationError, validate

from app.config import get_settings
from app.engine.audio_features import AudioFeatureError, extract_features
from app.llm.openai_compat import call_llm_json
from app.ramblbox.routes import agent_router as ramblbox_agent_router
from app.ramblbox.routes import list_router as ramblbox_list_router
from app.ramblbox.routes import router as ramblbox_router
from app.schemas import load_vox_schema

app = FastAPI(title="VOX Deploy v0.1")
app.include_router(ramblbox_router)
app.include_router(ramblbox_list_router)
app.include_router(ramblbox_agent_router)

SYSTEM_PROMPT = """You are a vocal coaching assistant.
Return ONLY valid JSON matching the provided JSON Schema.
Do not include markdown, code fences, or explanatory text.
Do not invent audio facts. If something is unknown, include it in warnings.
"""


@app.get("/", response_class=HTMLResponse)
async def index() -> str:
    return Path("app/web/index.html").read_text(encoding="utf-8")


@app.get("/ramblbox", response_class=HTMLResponse)
async def ramblbox_ui() -> str:
    return Path("app/web/ramblbox.html").read_text(encoding="utf-8")


@app.post("/analyse")
async def analyse(
    audio: UploadFile = File(...),
    goal: str = Form(default=""),
    style_target: str = Form(default=""),
    notes: str = Form(default=""),
) -> JSONResponse:
    settings = get_settings()
    if not settings.llm_api_key:
        raise HTTPException(
            status_code=400,
            detail="LLM_API_KEY is missing. Copy .env.example to .env and set LLM_API_KEY.",
        )

    schema = load_vox_schema()

    try:
        audio_bytes = await audio.read()
        features = extract_features(audio_bytes)
    except AudioFeatureError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse audio: {exc}") from exc

    prompt = {
        "schema": schema,
        "measured_features": features,
        "user_context": {
            "goal": goal,
            "style_target": style_target,
            "notes": notes,
        },
        "instruction": "Produce strict JSON only.",
    }

    try:
        raw_output = await call_llm_json(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            system=SYSTEM_PROMPT,
            user=json.dumps(prompt, ensure_ascii=False),
            temperature=0.3,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {exc}") from exc

    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "error": f"LLM returned non-JSON output: {exc}",
                "raw_output": raw_output,
            },
        )

    try:
        validate(instance=parsed, schema=schema)
    except ValidationError as exc:
        return JSONResponse(
            status_code=422,
            content={
                "error": f"Schema validation failed: {exc.message}",
                "raw_output": raw_output,
            },
        )

    return JSONResponse(
        status_code=200,
        content={"report": json.dumps(parsed, indent=2, ensure_ascii=False)},
    )
