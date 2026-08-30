from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, RedirectResponse

from app.ramblbox.routes import agent_router as ramblbox_agent_router
from app.ramblbox.routes import list_router as ramblbox_list_router
from app.ramblbox.routes import router as ramblbox_router

app = FastAPI(title="Ramblbox")
app.include_router(ramblbox_router)
app.include_router(ramblbox_list_router)
app.include_router(ramblbox_agent_router)


@app.get("/")
async def index() -> RedirectResponse:
    return RedirectResponse(url="/ramblbox")


@app.get("/ramblbox", response_class=HTMLResponse)
async def ramblbox_ui() -> str:
    return Path("app/web/ramblbox.html").read_text(encoding="utf-8")
