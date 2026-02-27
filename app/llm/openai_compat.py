from __future__ import annotations

import httpx


async def call_llm_json(
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.3,
) -> str:
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    url = f"{base_url.rstrip('/')}/chat/completions"

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()

    data = response.json()
    return data["choices"][0]["message"]["content"]
