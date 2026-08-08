# Ramblbox — personal setup (self-hosted, phone access)

This is the "just for me" setup: run it on your own Linux box (or WSL on the Windows machine),
point it at your OpenAI/ChatGPT key, and reach it from your phone over your Tailscale HTTPS URL.
No accounts, no deployment, nothing to sell.

## 1. Configure (no API key needed)

The app does **not** call an LLM — your agent does the summarizing (see
[`agent-integration.md`](agent-integration.md)). So there's nothing to pay for and no key to set for
notes. Copy `.env.example` to `.env` and you can leave the `LLM_*` values as-is.

The only real choice is **transcription** (audio → text), which still happens in the app:

```env
# Default: no real transcription, placeholder text (fine for wiring things up):
TRANSCRIBE_STUB=true
```

For real speech-to-text without paying per call, run a **local Whisper** and point transcription at
it, or have your agent transcribe. (If you *do* have an OpenAI API key and don't mind the pennies,
set `TRANSCRIBE_STUB=false` with `TRANSCRIBE_MODEL=whisper-1` and it'll use `{LLM_BASE_URL}/audio/transcriptions`.)

> The summaries come from your agent regardless of this setting — this only controls how segments
> get turned into text.

## 2. Run it (Linux / WSL)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` matters: it lets Tailscale reach the app from your phone (not just localhost).

On the same machine you can open http://127.0.0.1:8000/ramblbox to sanity-check.

## 3. Reach it from your phone over Tailscale (HTTPS — required for the mic)

Phone browsers block microphone access unless the page is served over **https** (or `localhost`).
A plain `http://100.x.x.x:8000` Tailscale IP will load the page but the record button won't work.
`tailscale serve` fixes this by giving you a real HTTPS URL with a valid cert:

```bash
# run this in the SAME environment the app runs in (e.g. inside WSL)
tailscale serve --bg 8000
tailscale serve status      # prints your https://<machine>.<tailnet>.ts.net URL
```

Then on your phone (signed into the same tailnet) open:

```
https://<machine>.<tailnet>.ts.net/ramblbox
```

Record → stop → think → record again → **Done** to assimilate. Your past notes show under
**Recent sessions**.

- Use `tailscale serve` (private to your tailnet), **not** `tailscale funnel` (that exposes it to
  the public internet — you don't want that for a personal notes app).
- To undo: `tailscale serve reset`.

### WSL note
If the app runs inside WSL but Tailscale runs on Windows, the `ts.net` URL points at Windows, not
WSL. Easiest fix: run **both** the app and `tailscale` inside the same WSL distro. (Alternatively
forward the port from Windows to WSL, but same-environment is simplest.)

## 4. Keep it running (optional)

For always-on, wrap the uvicorn command in a `systemd --user` service or a `tmux`/`screen` session
so it survives you closing the terminal. Not required to try it.

## Data

Everything lives in a local SQLite file at `RAMBLBOX_DB_PATH` (default `ramblbox.db`, gitignored).
Back that file up if the notes matter to you. Deleting it wipes all sessions.
