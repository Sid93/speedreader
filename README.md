# Speed Reader

Personal speed-reading toolkit. Web app + browser extension, free, no accounts.

- **Web app** — paste text, drop a PDF, or read any article URL. Progress + library + stats saved locally (IndexedDB).
- **Browser extension** — right-click any page or selection to speed-read it with RSVP.

Built with TypeScript + React + Vite + pnpm workspaces.

## Repo layout

```
packages/
  engine/       RSVP scheduler, ORP calc, tokenizer (pure, no DOM)
  extractors/   PDF (pdf.js), pasted text, URL articles (r.jina.ai)
  storage/      IndexedDB library / progress / stats (idb)
  web/          Static web app (Vite + React)
  extension/    Chrome MV3 extension (Vite + React)
legacy/
  rsvp-reader.html  Original single-file prototype (no deps, works offline)
```

## Dev

```bash
pnpm install
pnpm --filter @speedreader/web dev         # web app at :5173
pnpm --filter @speedreader/extension build # extension -> packages/extension/dist
pnpm --filter @speedreader/engine test     # engine unit tests
```

## Deploy

Web app auto-deploys to GitHub Pages on push to `main` via `.github/workflows/deploy.yml`.

## Install the extension

See [packages/extension/README.md](packages/extension/README.md).
