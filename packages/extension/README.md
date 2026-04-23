# Speed Reader — Browser Extension

Right-click any page or selection to speed-read it with RSVP.

## Install (unpacked, for dev / personal use)

1. From the repo root, build the extension:
   ```bash
   pnpm --filter @speedreader/extension build
   ```
2. Open Chrome / Comet / any Chromium browser → `chrome://extensions`
3. Toggle **Developer mode** (top right)
4. Click **Load unpacked** and pick `packages/extension/dist/`
5. Pin the extension icon to your toolbar (optional)

## Use

- **Right-click a page** → _Speed read this page_ (extracts article via r.jina.ai)
- **Highlight text, right-click** → _Speed read selection_
- Either opens a new tab with the RSVP reader.

## Rebuild after code changes

```bash
pnpm --filter @speedreader/extension build
```

Then click the reload icon on the extension card in `chrome://extensions`.

## Notes

- Icons not yet bundled — extension uses Chrome default icon until we add them.
- The reader tab is ephemeral: closing it loses the staged text.
  Progress tracking (like the web app has) is not wired yet for the extension.
