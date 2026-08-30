from __future__ import annotations

import httpx


async def notify_agent(url: str, payload: dict) -> bool:
    """Best-effort HTTP push to the agent when a session is ready.

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


async def notify_telegram(token: str, chat_id: str, text: str) -> bool:
    """Best-effort Telegram message to wake the agent on demand.

    Sends via the Bot API. Returns True on success, False on any failure or if
    not configured. Like the webhook, this is only a nudge — the session still
    sits in /agent/pending as a fallback.
    """
    if not (token and chat_id):
        return False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text},
            )
            response.raise_for_status()
        return True
    except Exception:  # noqa: BLE001 - notification is best-effort
        return False
