# Ramblbox

A personal, self-hosted capture loop for thinking out loud. A **session** is made of many short
segments — record → stop → think → record again — assimilated into one structured note once you
(or an import) mark it **Done**. Two equal capture paths feed the same pipeline:

- **Phone**: record segments in the browser, press Done.
- **Import** (e.g. an always-on Insta360 mic synced to Dropbox): `scripts/import_to_ramblbox.py`
  uploads externally-recorded audio through the same endpoints, so imported sessions are
  indistinguishable from phone-recorded ones once queued. See
  [`docs/agent-integration.md`](docs/agent-integration.md#a-second-capture-path-importing-externally-recorded-audio-eg-insta360-mic--dropbox).

Either way, your own agent transcribes the audio and turns the session into one structured note.

**The app calls no LLM and does no transcription.** It captures + stores audio and notifies your
agent; the agent downloads the audio, transcribes it, and writes the note back. So there's no API
key in this app and no per-call cost. See [`docs/agent-integration.md`](docs/agent-integration.md).

Why it's built this way — and why "ambient always-on" was dropped in favour of the multi-segment,
assimilate-on-Done model — is in [`docs/ramblbox-mvp-plan.md`](docs/ramblbox-mvp-plan.md).

## Quickstart

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # optional: set a push trigger (webhook or Telegram)
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open http://127.0.0.1:8000 (redirects to `/ramblbox`). To use it from your phone over your
Tailscale HTTPS URL — required for the microphone — see
[`docs/personal-setup.md`](docs/personal-setup.md).

## How it works

1. Record segments in the browser; each is stored as an audio file.
2. Press **Done** → the session is queued (`ready`) and a push fires to your agent (webhook and/or
   Telegram, if configured).
3. Your agent pulls the queue, downloads the audio, transcribes + assimilates it, and posts a note
   back. The session becomes `assimilated`.
4. Add more segments and press Done again to re-assimilate (the note version bumps) until you
   **archive** the session, which seals it.

## API

- Web UI: `GET /` → `/ramblbox` (one-tap `MediaRecorder` capture; no always-on/background listening).
- Capture:
  - `POST /session` — create a session (`201`, status `active`).
  - `POST /session/{id}/segment` — upload one audio segment (`201`).
  - `DELETE /session/{id}/segment/{segment_id}` — drop a segment (also deletes its audio file).
  - `POST /session/{id}/done` — queue the session and push to the agent.
  - `POST /session/{id}/archive` — seal the session (no more segments/notes).
  - `GET /session/{id}` — segments (with `audio_url`), status, latest note.
  - `GET /sessions` — recent sessions with note titles, for browsing history.
- Agent:
  - `GET /session/{id}/segment/{seg}/audio` — download raw segment audio to transcribe.
  - `GET /agent/pending` — sessions awaiting a note, each with audio URLs + schema.
  - `POST /session/{id}/note` — submit a schema-validated `ramble_note`; bumps `version`, sets
    status `assimilated`. `409` once archived.

Segment audio is stored under `RAMBLBOX_AUDIO_DIR`; sessions/notes in SQLite at `RAMBLBOX_DB_PATH`.

## Importing externally-recorded audio

```bash
python3 scripts/import_to_ramblbox.py --base-url http://127.0.0.1:8000 \
  --dir ~/downloads/insta360mic --manifest manifest.json
```

Groups files into sessions per a manifest you (or your agent) write, uploads them as segments via
the normal `/session` + `/segment` API, and marks each Done. Details, manifest format, and a
practical Hermes routine: [`docs/agent-integration.md`](docs/agent-integration.md).

## Docs

- [`docs/personal-setup.md`](docs/personal-setup.md) — run it and reach it from your phone via Tailscale.
- [`docs/agent-integration.md`](docs/agent-integration.md) — the agent contract + a copy-paste task prompt.
- [`docs/ramblbox-mvp-plan.md`](docs/ramblbox-mvp-plan.md) — rationale and roadmap.

## License

MIT
