# Ramblbox — agent integration (no API key)

Ramblbox does **not** call any LLM and does **not** transcribe. It only captures + stores audio and
notifies your agent. Your agent (wired to your ChatGPT Pro) transcribes the audio, summarizes it,
and writes the note back. No key lives in this app; nothing is billed per call.

## The loop

```
You (phone)                Ramblbox backend                 Your agent (Hermes)
-----------                ----------------                 -------------------
record segments  ───────▶  audio stored on disk
press "Done"     ───────▶  status = "ready"
                           GET /agent/pending  ◀────────────  cron poll (every few min)
                           GET segment audio   ◀────────────  download + transcribe
                           (agent assimilates)
                           POST /session/{id}/note  ◀───────  write structured note
                           status = "assimilated"
note appears on phone ◀──  (UI polls and shows it)
```

For Hermes the trigger is a **cron poll of `/agent/pending`** (see below). An optional webhook can
push on Done if your agent ever exposes an ingestion endpoint, but it's not required.

## How Hermes (OpenClaw) actually gets triggered

Hermes has **no inbound HTTP endpoint and no watched folder**, so the app can't push to it directly.
OpenClaw does support **scheduled cron tasks and heartbeats**, and both Hermes and this app run on
the same machine — so the trigger is a **cron poll**:

> Give Hermes a scheduled task (e.g. every 2–5 min, or on its 6-hour heartbeat) that calls
> `GET http://127.0.0.1:8000/agent/pending`, processes each ready session (download audio →
> transcribe → assimilate → `POST …/note`), and stops when the queue is empty.

That's the whole integration — no push, no ports opened, no Tailscale needed on the agent side
(Tailscale is only for reaching the phone UI). Latency is your cron interval; a 2-minute cron feels
near-instant for this use. The optional webhook below is a bonus for *if* you ever add an ingestion
endpoint — it is not required for Hermes.

### Hermes cron task prompt (copy-paste)

Set this as a scheduled OpenClaw task for Hermes (e.g. every 2 minutes). Each firing is a fresh
session, so the prompt is fully standalone. Change the host/port if the app doesn't run on
`127.0.0.1:8000`.

```text
You are processing the Ramblbox queue. The Ramblbox app runs locally and holds voice-note
sessions that are waiting for a structured note. Do this now, then stop.

1. GET http://127.0.0.1:8000/agent/pending
2. If the response is an empty array [], there is nothing to do. Stop silently — do not message me.
3. For EACH session object in the array:
   a. It has: session_id, segments[] (each with ord, filename, mime_type, audio_url),
      note_endpoint, and note_schema.
   b. Download each segment's audio_url and transcribe it to text, in ascending "ord" order.
   c. Treat the segments as ONE continuous train of thought from me thinking out loud — I may
      refine, contradict, or answer my own earlier points across segments. Assimilate the whole
      session into a SINGLE note.
   d. Build a JSON object that strictly matches note_schema:
        - title:   a short, specific title for the session
        - summary: 1-3 sentences capturing the through-line
        - category: exactly one of build_priority | customer_feedback | fundraising | personal | other
        - decisions:      [{ "text": ... }]           (things I decided; [] if none)
        - action_items:   [{ "text": ..., "urgency": "low"|"med"|"high", "owner": ... }]  (owner optional)
        - open_questions: [{ "text": ... }]           (things left unresolved)
        - tags:           ["..."]                      (a few short topic tags)
        - warnings:       ["..."]                      (e.g. where I contradicted myself, or audio was unclear)
      Do not invent facts. If something is ambiguous or unresolved, put it in open_questions or
      warnings rather than guessing. Only use categories/urgencies from the lists above.
   e. POST the JSON to that session's note_endpoint with header Content-Type: application/json.
   f. If the response status is 422, read the "error" field, fix the JSON to satisfy note_schema,
      and POST again.
4. After processing everything, if you wrote at least one note, send me a one-line Telegram summary
   like: "Ramblbox: assimilated 2 sessions — 'Cold outreach angles', 'Feature cut list'." If you
   wrote none, stay silent.
```

## Optional: get notified (push)

Set `AGENT_WEBHOOK_URL` in `.env` to an endpoint your agent listens on. The instant Done is pressed,
the app POSTs this JSON:

```jsonc
{
  "event": "session_ready",
  "session_id": "…",
  "created_at": "…",
  "segments": [
    { "ord": 1, "filename": "segment-….webm", "mime_type": "audio/webm",
      "audio_url": "https://<host>/session/<id>/segment/<seg>/audio" }
  ],
  "note_endpoint": "https://<host>/session/<id>/note",
  "note_schema": { …the JSON Schema the note must match… }
}
```

URLs are absolute, built from the host the phone used (your `ts.net` address), so they're fetchable
as-is. If the webhook fails or isn't set, the session still shows in `GET /agent/pending` with the
identical payload — poll that on a timer as a safety net.

## 2. Transcribe + assimilate

For each segment in `ord` order: `GET` its `audio_url` (returns the raw audio bytes), transcribe it,
and treat the segments as **one continuous train of thought** — the person may refine, contradict,
or answer their own earlier points across segments. Build a note that matches `note_schema`. Put
anything unresolved into `open_questions` / `warnings` rather than guessing.

## 3. Write the note back

```
POST {note_endpoint}
Content-Type: application/json

{ …the ramble_note JSON… }
```

The backend validates against the schema (`422` with `{"error": …}` if it doesn't match — fix and
resend), stores it with an incrementing `version`, and sets the session to `assimilated`, which
removes it from the queue. That's the whole contract.

If the person records more and presses Done again, the session returns to the queue and your agent
writes a fresh note (version bumps). Archiving seals a session — further `note`/`done`/`segment`
calls return `409`.

## Note shape (`ramble_note`)

Authoritative schema: `schemas/ramble_note.schema.json` (also included in every webhook/pending
payload as `note_schema`). Shape:

```jsonc
{
  "title": "string",
  "summary": "string",
  "category": "build_priority | customer_feedback | fundraising | personal | other",
  "decisions":      [{ "text": "string" }],
  "action_items":   [{ "text": "string", "urgency": "low|med|high", "owner": "string?" }],
  "open_questions": [{ "text": "string" }],
  "tags":           ["string"],
  "warnings":       ["string"]
}
```

## Endpoint reference

| Method & path | Who calls it | Purpose |
|---|---|---|
| `POST /session` | phone | start a session |
| `POST /session/{id}/segment` | phone | upload one audio take |
| `GET /session/{id}/segment/{seg}/audio` | **agent** | download raw audio to transcribe |
| `POST /session/{id}/done` | phone | queue + fire the webhook |
| `GET /agent/pending` | **agent** | poll fallback (same payload as webhook) |
| `POST /session/{id}/note` | **agent** | submit the structured note |
| `POST /session/{id}/archive` | phone | seal the session |
| `GET /session/{id}`, `GET /sessions` | phone | view / browse history |
