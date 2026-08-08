# Ramblbox — Viability Review & MVP Plan

_Review of the ideabrowser.com "Ramblbox" idea (12 screenshots), written against the existing
VOX Deploy codebase in this repo. This is an internal strategy note, not a spec._

## 1. What the idea is

**Ramblbox** (as pitched on ideabrowser): "ambient" always-on voice capture for solo founders.
It runs in the background, and the moment the founder stops talking it structures the ramble into
clean, searchable build notes:

- Decisions → action items
- Open questions → flagged
- Everything sorted into categories: build priorities, customer feedback, fundraising notes
- Voice-first search ("what did I say about pricing last week?")

Positioned **against Otter.ai**, which transcribes meetings and hands back a wall of raw text. The
pitch is: Ramblbox is for the founder thinking out loud _alone_, not in a meeting.

**Build sketch from the screenshots:** mobile app → speech-to-text → structured prompts that sort
each ramble into labeled categories → searchable DB tagged by session/topic/urgency. Test with 25
solo founders, refine extraction on their corrections (each edit feeds back into the model).
$15/mo/seat. Notion + Linear integrations. Distribution via indie-hacker / build-in-public
communities.

**ideabrowser scores:** Opportunity 9 · Problem 8 · Feasibility 8 · Why Now 8 · Overall 9.
Revenue potential $1M–$10M ARR. Execution difficulty 3/10. GTM 8/10. Keyword "voice recording
transcription" = 550K volume, +54900% growth. Comps: Otter.ai, Fireflies.ai, Notion, Wispr.

## 2. Honest viability read

**Verdict: the underlying job is real and worth building — but reframe the wedge. "Ambient
always-on" is the trap, and the ideabrowser scores are marketing, not gospel.**

### What's genuinely strong
- **Real, specific, felt pain.** Voice memos capture the raw thought but rot as un-reopened
  transcripts. "Parsing a two-week backlog takes longer than re-thinking the idea" is a true and
  narrow problem.
- **Tech is finally cheap + good.** Whisper-class ASR + an LLM structuring pass is a solved,
  inexpensive pipeline in 2026.
- **We already own ~80% of the machine.** VOX Deploy is: upload audio → process locally → LLM →
  **strict JSON schema → validate → display**. Ramblbox is the _same pipeline_ with transcription
  swapped for feature extraction and a "build note" schema swapped for the vocal-report schema. A
  working MVP is days, not months.

### What to push back on
1. **"Ambient / always-on background capture" is barely buildable on a phone.** iOS restricts
   background mic access hard; a genuinely always-listening recorder is a privacy, battery, and
   App-Store-rejection minefield. The most-hyped differentiator is the least shippable part. **v1
   should be one-tap / push-to-talk capture, not ambient.**
2. **The scores are promotional.** ideabrowser rates almost everything 8–9. "+54900% growth" is a
   vanity metric. "Execution 3/10" is optimistic once real capture, storage, and integrations are
   in scope.
3. **Thin moat on the core.** Transcription is a commodity; the structuring layer is _a prompt_.
   Otter, Granola, Wispr Flow, Notion AI, and Apple Notes can all bolt on "structure my voice
   memo." Defensibility is **not** ASR — it's (a) compounding memory over time, (b) structuring
   trustworthy enough that users stop double-checking it, and (c) depth of integration into where
   work lands.
4. **Narrow, cheap, churny ICP.** Solo founders at $15/mo are price-sensitive and high-churn.
   $1–10M ARR ≈ 5.5k–55k paying seats. Reachable, but the honest TAM is "anyone who thinks out loud
   and needs it structured": consultants, PMs, researchers, writers, sales. Use founders as the
   beachhead, don't design into a box.

### The reframed wedge to actually build
> **The fastest path from a spoken ramble to a structured, searchable, action-ready note that lands
> in the tools you already use.**

Zero-friction capture + structuring you trust + it shows up in Notion/Linear. Moat = trust +
compounding memory + integrations, not "always-on."

## 3. MVP plan

### Guiding principles
- **Prove the core loop before building an app.** The core loop is _ramble in → trustworthy
  structured note out_. If that isn't magic, nothing downstream matters.
- **Reuse VOX Deploy.** Same FastAPI + strict-JSON-schema + validation scaffolding.
- **Cut ambient.** One-tap record / file upload only in v1.
- **Web first, mobile later.** A mobile-web record button covers 90% of the value with 10% of the
  effort and zero App Store risk.

### Scope: v0 (internal proof, ~days) — reuse this repo
Goal: prove structuring quality on real founder rambles.

1. **Capture:** `.wav`/`.mp3` upload + browser `MediaRecorder` one-tap record. (Upload path already
   exists.)
2. **Transcribe:** add a `transcribe()` step (Whisper API or local `faster-whisper`) that returns
   text. This slots in exactly where `extract_features()` sits today in `app/main.py`.
3. **Structure:** LLM call with a new `ramble_note` schema (below), replacing the vocal-report
   schema. Reuse `call_llm_json()` + `jsonschema` validation verbatim.
4. **Display:** render the structured note; show validation/debug errors on failure (already built).
5. **Store:** append each validated note as a JSON row to a local SQLite table (session, topic,
   urgency, created_at). Enables the search demo.

**`ramble_note` schema (first cut):**
```jsonc
{
  "title": "string",
  "summary": "string",
  "category": "build_priority | customer_feedback | fundraising | personal | other",
  "decisions":      [{ "text": "string" }],
  "action_items":   [{ "text": "string", "urgency": "low|med|high", "owner": "string" }],
  "open_questions": [{ "text": "string" }],
  "tags":           ["string"],
  "warnings":       ["string"]   // for anything the model was unsure about
}
```

### Scope: v1 (first users, ~2–4 weeks)
Goal: 25 founders using it weekly, measuring whether structuring is trusted.

- **Accounts + persistence:** move from SQLite/local to a hosted DB (Supabase/Postgres). Notes
  tagged by session, topic, urgency (matches the pitch).
- **Search:** keyword + semantic search over stored notes. Voice-first search ("what did I say
  about pricing") is a v1.5 nicety — text search first.
- **One integration, done well:** push action items to **Notion** OR **Linear** (pick one based on
  the first 5 design-partner interviews). Depth beats breadth.
- **The correction loop:** let users edit the structured output inline, and **log every edit**.
  This is the real product asset — it's your eval set and your fine-tuning/prompt-improvement fuel.
- **Mobile web:** responsive record button, installable PWA. No native app yet.

### Explicitly NOT in the MVP
- Native iOS/Android app
- Ambient / always-on background capture
- Multiple integrations at once
- Team/multi-seat features
- Fine-tuned model (prompt + few-shot from the correction log first)

### Success metrics (what tells us to continue)
- **Activation:** % of signups who capture ≥3 rambles in week 1.
- **Trust proxy:** edit rate per structured note trending _down_ over sessions (structuring is
  improving / being trusted).
- **Retention:** % capturing in week 4 (the number that actually predicts a business).
- **Pull:** do users ask for the integration unprompted? That's demand for the "lands in your
  tools" thesis.

### Cost / risk notes
- ASR + LLM cost per ramble is cents; at $15/mo the unit economics are fine as long as usage isn't
  pathological. Cap/monitor per-user minutes.
- Biggest risk is **not** tech — it's **differentiation + churn**. Mitigate via the correction loop
  (compounding quality) and integration depth (switching cost), not via features.

## 4. Recommendation

Build it — as a **web-first, one-tap "ramble → structured note" tool**, not an ambient recorder.
Reuse the VOX Deploy pipeline to get a v0 in front of real founders within days, and let the
edit/correction data decide whether the structuring is good enough to be a business. Treat the
ideabrowser scores as a prompt, not a verdict; the real signal will be week-4 retention among the
first 25 users.
