# App Store assets

## screenshots/
Captured from the live app via the `?demo=` staging mode (see
`packages/web/src/demo.ts`) at exact App Store Connect sizes:

- `iphone-*.png` — 1284×2778 (iPhone 6.5" slot)
- `ipad-*.png` — 2064×2752 (iPad 13" slot)

Upload order: reader, overlay, links, library (the first three appear on
the App Store install sheet).

To regenerate after UI changes: run the dev server, then the puppeteer
script (states: `?demo=reader&at=110`, `?demo=reader&at=190`,
`?demo=links`, `?demo=library`).

Screenshots are LOCKED while a version is Waiting for Review — upload
them while the next version is in Prepare for Submission.
