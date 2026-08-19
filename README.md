# pi-computer-history

Pi package that wraps Cua Driver Computer History (`history_status` / `history_query`) plus a small Cua action set for the [pi coding agent](https://pi.dev).

Computer History is an opt-in, encrypted, metadata-only record of Cua-mediated desktop actions. This package is meant to be history-aware in pi: discover the tools at runtime, consult a bounded recent slice on continue/recent-work requests, and degrade when history is absent or denied.

## Getting started

Extension and skill scaffolding is not in this repo yet. Prerequisites on the host:

```bash
cua-driver channel set nightly
cua-driver update --apply
cua-driver history enable
cua-driver history status
```

Then load the package (once it exists) with:

```bash
pi -e /path/to/pi-computer-history
# or
pi install /path/to/pi-computer-history
```

## License

MIT
