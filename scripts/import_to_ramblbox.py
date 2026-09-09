#!/usr/bin/env python3
"""Import externally-recorded audio (e.g. Insta360 mic files pulled from Dropbox) into
Ramblbox as one or more sessions, using the exact same endpoints the phone UI uses.

This makes imported sessions indistinguishable from phone-recorded ones: same /session
create, same /segment uploads, same /done queueing, same /agent/pending -> /note flow.
No changes to the app are needed for this to work.

Grouping which files belong to the same session is a judgment call (a device may
auto-split one continuous recording into several files, or you may want several close-
together files treated as one ramble) -- this script does not guess. You (or your agent)
decide the grouping and describe it in a manifest; this script just executes it.

Manifest format (JSON):
{
  "sessions": [
    {
      "note": "optional human-readable label, ignored by the script",
      "files": ["audio_260909_171205_32bit_orig.wav", "audio_260909_174207_32bit_orig.wav"]
    },
    {
      "files": ["audio_260909_125501_32bit_orig_stereo.wav"]
    }
  ]
}

Files are resolved relative to --dir and uploaded in the order listed, which becomes
each segment's order within the session.

Usage:
    python3 scripts/import_to_ramblbox.py \\
        --base-url http://127.0.0.1:8000 \\
        --dir ~/downloads/insta360mic \\
        --manifest manifest.json \\
        [--done / --no-done]

By default each imported session is immediately marked Done (queued for the agent),
matching what pressing Done on the phone does. Pass --no-done to leave sessions active
so more segments could be added first.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx


def load_manifest(path: Path) -> list[list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    sessions = data.get("sessions")
    if not isinstance(sessions, list) or not sessions:
        raise ValueError("Manifest must have a non-empty 'sessions' list.")
    groups: list[list[str]] = []
    for i, entry in enumerate(sessions):
        files = entry.get("files")
        if not isinstance(files, list) or not files:
            raise ValueError(f"sessions[{i}] must have a non-empty 'files' list.")
        groups.append(list(files))
    return groups


def guess_mime_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return {
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "ogg": "audio/ogg",
        "webm": "audio/webm",
        "flac": "audio/flac",
    }.get(ext, "application/octet-stream")


def import_sessions(
    client: httpx.Client,
    base_dir: Path,
    groups: list[list[str]],
    mark_done: bool,
) -> list[dict]:
    """Create one Ramblbox session per group, upload its files as segments in order,
    and optionally mark it Done. Returns a result dict per session for the caller to
    report back (id, segment count, done/notified status, or an error).
    """
    results: list[dict] = []
    for group in groups:
        result: dict = {"files": group}
        try:
            missing = [f for f in group if not (base_dir / f).is_file()]
            if missing:
                raise FileNotFoundError(f"not found under {base_dir}: {missing}")

            created = client.post("/session")
            created.raise_for_status()
            session_id = created.json()["id"]
            result["session_id"] = session_id

            for filename in group:
                file_path = base_dir / filename
                with open(file_path, "rb") as fh:
                    resp = client.post(
                        f"/session/{session_id}/segment",
                        files={"audio": (filename, fh, guess_mime_type(filename))},
                    )
                resp.raise_for_status()
            result["segments"] = len(group)

            if mark_done:
                done_resp = client.post(f"/session/{session_id}/done")
                done_resp.raise_for_status()
                done_data = done_resp.json()
                result["status"] = "ready"
                result["notified"] = done_data.get("notified")
                result["channels"] = done_data.get("channels")
            else:
                result["status"] = "active"

        except Exception as exc:  # noqa: BLE001 - report per-session, keep going
            result["error"] = str(exc)

        results.append(result)
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", required=True, help="Ramblbox base URL, e.g. http://127.0.0.1:8000")
    parser.add_argument("--dir", required=True, type=Path, help="Local directory holding the downloaded audio files")
    parser.add_argument("--manifest", required=True, type=Path, help="Path to the JSON manifest describing session groupings")
    done_group = parser.add_mutually_exclusive_group()
    done_group.add_argument("--done", dest="mark_done", action="store_true", default=True, help="Mark each imported session Done (default)")
    done_group.add_argument("--no-done", dest="mark_done", action="store_false", help="Leave imported sessions active instead of queueing them")
    args = parser.parse_args()

    base_dir = args.dir.expanduser().resolve()
    if not base_dir.is_dir():
        print(f"error: --dir {base_dir} is not a directory", file=sys.stderr)
        return 2

    try:
        groups = load_manifest(args.manifest)
    except (ValueError, json.JSONDecodeError, OSError) as exc:
        print(f"error: invalid manifest: {exc}", file=sys.stderr)
        return 2

    with httpx.Client(base_url=args.base_url, timeout=120.0) as client:
        results = import_sessions(client, base_dir, groups, args.mark_done)

    ok = 0
    for r in results:
        if "error" in r:
            print(f"FAIL  {r['files']}: {r['error']}")
        else:
            print(f"OK    session {r['session_id']}  ({r['segments']} segment(s), status={r['status']})")
            ok += 1

    print(f"\n{ok}/{len(results)} sessions imported successfully.")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
