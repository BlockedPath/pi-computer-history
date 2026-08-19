---
name: computer-history
description: >
  Consult Cua Computer History for continue, resume, recall-recent-Cua-work,
  or explain-prior-Cua-run requests. Use when the user asks what a prior Cua
  run did, where a Cua-mediated workflow stopped, or to hydrate from history
  before inspecting the live desktop. Do not load this skill for unrelated
  coding tasks merely because the history tools exist.
license: MIT
compatibility: Requires cua-driver on PATH (nightly channel for history_status / history_query).
---

# Computer History

Cua Computer History is an opt-in, encrypted, metadata-only record of
**Cua-mediated** desktop actions. It is not a general desktop recorder.

Load this skill for continuation and recent-work requests. Skip it for
unrelated tasks even when `history_status` and `history_query` are present.

## Consultation policy

For a matching request:

1. Discover whether `history_status` and `history_query` are in the active tool list. If they are absent, continue without history.
2. Call `history_status` first. Preserve disabled, paused, unhealthy, or dropped-event state in your reasoning. Never claim completeness.
3. When status permits a useful read and `history_query` is available, call `history_query` with a bounded recent slice (`limit` 50 unless paging) **before** `list_apps`, `list_windows`, or `get_window_state`.
4. Treat returned events as metadata-only evidence, not a transcript.
5. Keep omitted content unknown: typed text, screenshots, clipboard, paths, window titles, URLs, tool arguments, tool results, geometry, and user intent.
6. Use an identified application or capability as a lead, then verify **current** state with the least intrusive live tool (`list_apps` → `list_windows` → `get_window_state`).
7. After absence, denial, empty results, or a recoverable history failure, continue the original task without history.

You may make more bounded `history_query` calls when an initial slice contains a relevant `session_id` or sequence boundary. Do not broaden a query merely to fill fields the schema excludes.

Do not enable, pause, resume, disable, delete, export, or request encryption keys. Those are user controls (`/history`). Do not shell `cua-driver history …` or `cua-driver call history_*`. Do not read the encrypted store on disk.

## Live actions

After history (or when history is unavailable):

- `list_apps` — running/installed apps
- `list_windows` — `window_id` for a pid
- `get_window_state` — once per turn per `(pid, window_id)` before element-indexed actions. Leave `include_screenshot` false unless you need pixel targeting.
- `click` — prefer `element_token`
- `type_text` — prefer `element_token`

These wrappers talk to `cua-driver call`. They need a running Cua Driver daemon.

## Paging

Events are ordered by `data.sequence` ascending. A query keeps the newest `limit` matches and returns them in ascending sequence order. Page older with `until_sequence` below the first sequence you have; page newer with `since_sequence` above the last. Bounds are inclusive, so adjust by one for non-overlapping pages. Missing sequence numbers are valid gap evidence.
