# pi-computer-history

Pi package that wraps [Cua Driver](https://github.com/trycua/cua) Computer History (`history_status` / `history_query`) plus a small Cua action set for the [pi coding agent](https://pi.dev).

Computer History is an opt-in, encrypted, metadata-only record of Cua-mediated desktop actions. This package is **history-aware**: it discovers the tools at runtime, consults a bounded recent slice on continue/recent-work requests, and degrades when history is absent or denied.

It does **not** register the full Cua MCP catalog. Pi has no native MCP; the wrappers use `cua-driver call`.

## Install

```bash
pi install https://github.com/BlockedPath/pi-computer-history
# or from a local clone
pi install /path/to/pi-computer-history
# try without installing
pi -e /path/to/pi-computer-history
```

## Test

Automated checks cover TypeScript and package load, plus unit tests for discovery, formatting, `/history` parsing, the store/CLI guard, and the consultation skill. They do not require a Cua daemon or the nightly channel.

```bash
cd /path/to/pi-computer-history
npm install
npm test
```

Interactive Cua tests (daemon, nightly history tools, continue/recent-work prompts) are still manual. See the user-command and live-tool sections below.

## Prerequisites

History tools ship on the Cua Driver **nightly** channel. Stable `0.20.0` advertises the action tools but not `history_status` / `history_query`.

```bash
cua-driver channel set nightly
cua-driver update --apply
cua-driver serve          # daemon must be running for `cua-driver call`
cua-driver history enable
cua-driver history status
cua-driver list-tools     # should include history_status and history_query
```

Override the binary with `CUA_DRIVER_BIN` or `pi --cua-driver-bin /path/to/cua-driver`.

On Linux, Secret Service must be unlocked or history fails closed.

## What the agent gets

Registered only when `cua-driver list-tools` advertises them:

| Tool | Role |
| --- | --- |
| `history_status` | Operational status. No events. Capability `history.status`. |
| `history_query` | Bounded metadata-only events. Capability `history.query`. Limit 1–200, default 50. |
| `list_apps` | Running and installed apps |
| `list_windows` | `window_id` values for `get_window_state` |
| `get_window_state` | One-window snapshot. This wrapper defaults `include_screenshot` to `false`. |
| `click` | Prefer `element_token` |
| `type_text` | Prefer `element_token`. History never stores the characters. |

A bundled `computer-history` skill tells the model when to consult history. That is the RFC **history-aware** level, not deterministic host preflight.

## User commands

`/history` is user-only. It is not an LLM tool.

```
/history status
/history list [n]
/history show <sequence>
/history enable
/history pause
/history resume
/history disable
/history delete
```

Enable and delete ask for confirmation. Agents cannot perform those operations through tools. The extension also blocks bash/`read`/`write` against the encrypted store and `cua-driver history` / `cua-driver call history_*` from the model.

## Boundaries

- Do not decrypt or open the CBOR/COSE store.
- History never includes screenshots, keystrokes, clipboard, tool args/results, accessibility trees, paths, titles, or URLs.
- Status permission does not imply query permission.
- Successful non-empty `history_query` appends an encrypted access record inside Cua. This package does not copy events into pi telemetry.
- History records Cua-mediated actions after the user opts in. It is not a general desktop recorder.

## Layout

```
extensions/computer-history/   # pi extension
skills/computer-history/       # consultation policy
```

## License

MIT
