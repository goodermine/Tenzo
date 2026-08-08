# Ramblbox — agent integration (no API key)

Ramblbox does **not** call any LLM itself. The app is just capture + storage. Your own agent
(the one wired to your ChatGPT Pro) does the summarizing by reading the backend and writing notes
back. No API key lives in this app, and there's no per-call billing.

## The loop

```
You (phone)                Ramblbox backend                 Your agent
-----------                ----------------                 ----------
record segments  ───────▶  stored + transcribed
press "Done"     ───────▶  session status = "ready"
                           GET /agent/pending  ◀──────────  poll (or triggered)
                           (returns transcript + schema) ──▶ agent assimilates
                           POST /session/{id}/note  ◀──────  writes structured note
                           status = "assimilated"
note appears on phone ◀──  (UI polls and shows it)
```

## What your agent does

1. **Poll the queue** (however your agent likes — a loop, a Telegram command, a schedule):
   ```
   GET http://<host>:8000/agent/pending
   ```
   Returns a list; each item has:
   - `session_id`
   - `stitched_transcript` — all segments in order, ready to read
   - `note_schema` — the exact JSON Schema the note must match
   - `segment_count`, `created_at`

2. **Assimilate** the `stitched_transcript` into a note that matches `note_schema`. Treat the
   segments as one continuous train of thought — the person may refine, contradict, or answer their
   own earlier points across segments. Capture unresolved things in `open_questions` / `warnings`
   rather than guessing.

3. **Write it back**:
   ```
   POST http://<host>:8000/session/{session_id}/note
   Content-Type: application/json

   { ...the ramble_note JSON... }
   ```
   The backend validates it against the schema (`422` if it doesn't match — fix and resend),
   stores it with an incrementing `version`, and sets the session to `assimilated`, which removes
   it from the pending queue.

That's the whole contract. If the person records more and presses Done again, the session returns
to the queue and your agent produces a fresh note (version bumps). Archiving a session seals it —
further `note`/`done`/`segment` calls return `409`.

## Note shape (`ramble_note`)

Authoritative schema: `schemas/ramble_note.schema.json` (also returned in every `/agent/pending`
item). Shape:

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

## Transcription

Segments are transcribed when they're uploaded, controlled by `TRANSCRIBE_STUB` (see
`personal-setup.md`). If you'd rather your agent also handle transcription, keep `TRANSCRIBE_STUB=true`
and treat the placeholder transcript as a stand-in — but the simplest path is local Whisper in the
app so your agent only ever deals with text.

## Optional: skip the agent

There's still a `POST /session/{id}/assimilate` that calls an LLM directly — but it only works if
you set `LLM_API_KEY`. With the agent flow you don't need it, and no key is required.
