from __future__ import annotations

import httpx


async def notify_agent(url: str, payload: dict) -> bool:
    """Best-effort push to the agent when a session is ready.

    Returns True if the agent accepted the notification, False on any failure.
    A failure is not fatal: the session still sits in /agent/pending for polling.
    """
    if not url:
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
        return True
    except Exception:  # noqa: BLE001 - notification is best-effort
        return False
