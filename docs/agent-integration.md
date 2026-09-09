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

Hermes has no inbound HTTP endpoint and no watched folder — but it **does wake from Telegram**. So
the efficient trigger is **on demand, not a timer**: the app sends a Telegram message the instant you
press Done, Hermes wakes once, processes the queue, and goes back to sleep. No idle polling, so no
credits are spent on empty checks.

**Primary trigger — Telegram push on Done.** Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in
`.env` (a chat that routes to Hermes). On Done the app posts a message like:

> 🎙️ Ramblbox: a session is ready to assimilate (2 segment(s)). Run the Ramblbox queue.

Give Hermes a standing instruction: *when you see a "Run the Ramblbox queue" message, do the
Ramblbox queue task below.* That's one model wake-up per ramble you actually finish — nothing when
you're idle.

**Safety net — a long heartbeat, not a fast poll.** So nothing is ever stranded if a message is
missed, also run the same queue task on a **slow** schedule — ride Hermes's existing 6-hour
heartbeat, or a cron no tighter than hourly. This is a backstop, not the main path, so keep the
interval long to avoid burning credits on empty checks.

No ports opened, no Tailscale on the agent side (Tailscale is only for the phone UI). The HTTP
webhook below is an alternative to the Telegram push *if* you ever give Hermes an ingestion endpoint.

### Hermes "Ramblbox queue" task prompt (copy-paste)

Use this same prompt for **both** triggers: as the action Hermes runs when it sees a
"Run the Ramblbox queue" Telegram message, **and** as the slow safety-net heartbeat task. It's
fully standalone and stops silently when the queue is empty, so running it on the 6-hour heartbeat
costs almost nothing. Change the host/port if the app doesn't run on `127.0.0.1:8000`.

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

## A second capture path: importing externally-recorded audio (e.g. Insta360 mic + Dropbox)

Not every ramble has to start on the phone. If you've got an always-on recorder (like an
Insta360 mic) that you sync to Dropbox after the fact, `scripts/import_to_ramblbox.py` gets
those files into Ramblbox through the **exact same endpoints** the phone UI uses — `/session`,
`/segment`, `/done` — so an imported session is indistinguishable from a phone-recorded one
once it's in the queue. No app changes, no separate code path for the agent to handle.

This is a **separate, equal path**, not a replacement for the phone recorder — use whichever
fits the moment.

### Who decides the grouping

A recorder like the Insta360 mic auto-splits a long continuous recording into multiple files
(e.g. every 30 minutes). Whether several files belong in *one* Ramblbox session or several is a
judgment call — the script does not guess it. That decision belongs to you or your agent,
looking at the actual file timestamps (e.g. two files whose start/end are seconds apart are
almost certainly one continuous recording; files an hour apart are not).

### The manifest

Describe the grouping as a small JSON file:

```json
{
  "sessions": [
    { "note": "date night dinner", "files": ["audio_260909_171205_orig.wav", "audio_260909_174207_orig.wav"] },
    { "files": ["audio_260909_125501_orig_stereo.wav"] }
  ]
}
```

`files` are resolved relative to `--dir` and uploaded in the listed order (that order becomes
each segment's position in the session). `note` is a human label only — ignored by the script.

### Running it

```bash
python3 scripts/import_to_ramblbox.py \
  --base-url http://127.0.0.1:8000 \
  --dir ~/downloads/insta360mic \
  --manifest manifest.json
```

Each group becomes one session and is marked **Done** immediately (pass `--no-done` to leave
sessions active instead, e.g. if you want to add more segments first). From there it's the same
loop as a phone recording: the session lands in `GET /agent/pending` (and fires the webhook/
Telegram push if configured), your agent transcribes and assimilates it, and posts the note back
to `note_endpoint`.

### A practical Hermes routine

1. Pull new files from the Dropbox folder (Hermes already has Dropbox access) into a local
   working directory.
2. Look at each file's start time (and Dropbox's `modified_time`, a good proxy for when
   recording stopped) to decide which files belong to the same session — files that resume
   within a couple of seconds of each other are one continuous recording; anything separated
   by more than a few minutes is a new session.
3. Write that grouping out as a manifest and run the import script.
4. Continue exactly as normal — `/agent/pending` now shows these sessions alongside any
   phone-recorded ones, indistinguishable from them.

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
