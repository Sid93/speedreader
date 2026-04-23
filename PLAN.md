# Speed Reader Toolkit — Plan

Personal speed-reading toolkit. Web app + browser extension sharing one RSVP engine.
Free, static-hosted, no backend, no accounts. Storage: `localStorage` + IndexedDB.

Starting point: `rsvp-reader.html` (PDF-only prototype, working).

---

## Target End State

**Web app** (static site, hosted on GitHub Pages or Vercel):
- Inputs: PDF, EPUB, pasted text, URL (article extraction)
- RSVP reader with ORP highlighting, WPM control, keyboard shortcuts
- Personal library with reading progress (resume where you left off)
- Reading stats (words read, time saved, WPM over time)

**Browser extension** (Chrome MV3, likely Firefox too):
- Right-click any page → "Speed read this page" (extracts article)
- Right-click selection → "Speed read selection"
- Popup with same RSVP engine as web app

**Shared**: one `rsvp-engine` module used by both surfaces.

---

## Project Structure

```
speedreader/
├── PLAN.md                    # this file
├── README.md
├── package.json               # workspace root; vite + shared deps
├── pnpm-workspace.yaml        # or npm workspaces
├── packages/
│   ├── engine/                # shared RSVP core (pure TS/JS, no DOM deps)
│   │   ├── src/
│   │   │   ├── rsvp.ts        # word scheduler, ORP calc, punctuation handling
│   │   │   ├── tokenize.ts    # text → words
│   │   │   └── index.ts
│   │   └── package.json
│   ├── extractors/            # input → plain text (lazy-loaded per type)
│   │   ├── src/
│   │   │   ├── pdf.ts         # wraps pdf.js
│   │   │   ├── epub.ts        # wraps epub.js
│   │   │   ├── article.ts     # wraps Readability.js
│   │   │   └── index.ts
│   │   └── package.json
│   ├── ui/                    # shared UI components (RSVP display, controls)
│   │   └── src/
│   │       ├── Reader.tsx
│   │       ├── Controls.tsx
│   │       └── index.ts
│   ├── storage/               # IndexedDB wrapper (idb library)
│   │   └── src/
│   │       ├── library.ts     # saved documents
│   │       ├── progress.ts    # position per doc
│   │       └── stats.ts       # aggregate reading stats
│   ├── web/                   # web app (Vite + React)
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   └── pages/
│   │   │       ├── Home.tsx
│   │   │       ├── Reader.tsx
│   │   │       └── Library.tsx
│   │   ├── index.html
│   │   └── vite.config.ts
│   └── extension/             # Chrome MV3 extension
│       ├── src/
│       │   ├── background.ts  # context menu registration
│       │   ├── content.ts     # extract page content
│       │   └── popup/         # popup UI (reuses ui package)
│       ├── manifest.json
│       └── vite.config.ts
└── rsvp-reader.html           # keep original as reference/fallback
```

**Stack choice**:
- **TypeScript + React + Vite** — single toolchain for web app + extension; React is optional but speeds up component reuse.
- **pnpm workspaces** — clean monorepo with shared packages.
- **idb** library for IndexedDB (tiny, typed wrapper).
- **Alternative (simpler)**: vanilla JS, no framework, no build step. Fine if we don't care about component reuse and only need one or two screens. **Recommend React/Vite** because extension popup + web app will share UI.

---

## Phase 0: Documentation Discovery

Before any build phase, the agent starting that phase reads the relevant docs and produces a short "Allowed APIs" note. Key docs per phase:

- **Phase 2 (extractors)**:
  - PDF.js: https://mozilla.github.io/pdf.js/ — `getDocument`, `getTextContent`
  - Mozilla Readability: https://github.com/mozilla/readability — `new Readability(doc).parse()`
  - epub.js: https://github.com/futurepress/epub.js — `ePub(buffer).loaded.navigation`
- **Phase 5 (extension)**:
  - Chrome MV3: https://developer.chrome.com/docs/extensions/mv3/
  - `chrome.contextMenus`, `chrome.scripting.executeScript`, `chrome.runtime.sendMessage`
- **Phase 3 (storage)**:
  - `idb` library: https://github.com/jakearchibald/idb

Anti-patterns to avoid (call out at phase start):
- Inventing methods on PDF.js (stick to `getDocument`, `getPage`, `getTextContent`)
- Using deprecated MV2 APIs (`chrome.tabs.executeScript` → use `chrome.scripting`)
- Storing large blobs in `localStorage` (use IndexedDB for anything > a few KB)

---

## Phase 1: Monorepo Scaffold & Engine Extraction

**Goal**: Working monorepo. Extract RSVP logic from `rsvp-reader.html` into `packages/engine`. Web app renders one hardcoded string via the new engine.

**Tasks**:
1. `pnpm init`, set up workspaces, TS config, shared ESLint/Prettier
2. Create `packages/engine` with:
   - `tokenize(text: string): string[]`
   - `getORP(word: string): { before, orp, after }`
   - `createScheduler({ wpm, onTick, skipPunct }): { play, pause, step, seek, getState }`
3. Create `packages/web` (Vite + React), render a minimal Reader page that plays a hardcoded paragraph
4. Unit tests for engine (ORP calc, tokenizer, scheduler tick timing)

**Verification**:
- `pnpm --filter engine test` passes
- `pnpm --filter web dev` shows RSVP playing the hardcoded string
- Grep: no DOM APIs in `packages/engine/src`

---

## Phase 2: Input Extractors + Web App Polish

**Goal**: Web app accepts PDF, pasted text, and URL. Feature parity with `rsvp-reader.html` plus URL input. EPUB deferred to phase 4.

**Tasks**:
1. `packages/extractors` with lazy-loaded adapters:
   - `extractPdf(file: File): Promise<string>` — port from rsvp-reader.html
   - `extractText(text: string): Promise<string>` — trivial passthrough
   - `extractArticle(url: string): Promise<{ title, text }>` — fetch + Readability.js. **Note**: CORS. Solve with a public CORS proxy OR a tiny Cloudflare Worker OR tell the user to paste content. Decide in Phase 2 kickoff — recommend Cloudflare Worker (free tier, one file).
2. Web app pages: Home (input picker), Reader (RSVP), Settings
3. Port all controls from `rsvp-reader.html`: speed slider, presets, font size, dark/light, keyboard shortcuts, context words, progress bar
4. Responsive styling; use CSS modules or Tailwind

**Verification**:
- Upload a PDF → reads correctly
- Paste text → reads correctly
- Paste URL (e.g., a Substack post) → extracts and reads
- All keyboard shortcuts work

---

## Phase 3: Library + Progress + Stats (Storage)

**Goal**: Documents persist. Reading resumes where you left off. Basic stats dashboard.

**Tasks**:
1. `packages/storage` using `idb`:
   - `library`: `{ id, title, source, text, addedAt, wordCount }`
   - `progress`: `{ docId, currentIndex, updatedAt }`
   - `stats`: aggregate — total words read, total sessions, WPM history (rolling)
2. Web app:
   - Library page (list, open, delete)
   - Auto-save document on load
   - Auto-save progress on pause and every N words
   - Stats page (cards: total words, hours saved vs 250 WPM baseline, avg WPM)

**Verification**:
- Close tab mid-read → reopen → resumes at same word
- Library persists across sessions
- Stats increment correctly

---

## Phase 4: EPUB Support + Chunked/Bionic Modes

**Goal**: Books + advanced reading modes.

**Tasks**:
1. EPUB extractor (epub.js) — preserve chapter boundaries for progress
2. Engine enhancements:
   - Chunk mode: 2–3 words shown together (configurable)
   - Bionic mode: bold first ~40% of each word (alternative to RSVP, good for re-reading)
3. Reader UI toggle between RSVP / Bionic / Chunk modes

**Verification**:
- Upload EPUB → shows chapter list → reads a chapter
- Bionic mode renders a passage with correct bolding
- Chunk mode advances by N words per tick

---

## Phase 5: Browser Extension

**Goal**: Right-click → speed read current page or selection.

**Tasks**:
1. `packages/extension` with MV3 manifest
2. Background service worker: register `chrome.contextMenus` items ("Speed read page", "Speed read selection")
3. Content script: runs Readability.js on the page, sends text to popup
4. Popup: imports `ui` + `engine`, renders Reader
5. Package: build output → `extension/dist`, loadable as unpacked extension
6. Optional: also register a keyboard shortcut (commands API)

**Verification**:
- Load unpacked in Chrome → context menu appears
- Right-click page → popup opens with extracted article
- Right-click selection → popup reads just the selection

---

## Phase 6: Deploy + Share

**Goal**: Web app live at a URL; extension installable by family.

**Tasks**:
1. GitHub repo, `main` branch
2. GitHub Actions: build web app, deploy to GitHub Pages (or Vercel)
3. Extension: either publish to Chrome Web Store ($5 one-time dev fee) OR distribute `.zip` via Google Drive for family to load as unpacked. **Recommend**: Web Store for ease; family just clicks install.
4. README with install instructions

**Verification**:
- Visit the deployed URL on phone + desktop → works
- Install extension from Web Store → right-click speed-reads a page

---

## Future Ideas (Parked — Details TBD)

- **Word bunching** — grouping strategy beyond fixed N-word chunks (user to explain later)
- **Focus editor** — (user to explain later)

---

## Phase 7 (Optional, Later): PWA + Mobile Polish

- Add service worker + manifest → installable on iOS/Android as home-screen app
- Touch gestures (tap to pause, swipe to rewind)
- Offline: cached library works without network

---

## Decisions Still Open (Resolve Before Phase 1)

1. **React or vanilla?** → Recommend React+Vite+TS. Say "no" if you want to keep it zero-framework.
2. **CORS for URL extraction** → Cloudflare Worker (1 file, free) vs public proxy (flaky) vs "paste only" (no URL input). Recommend Worker in Phase 2.
3. **Monorepo tool** → pnpm recommended. npm workspaces also fine.
4. **Keep `rsvp-reader.html`?** → Yes, as a zero-dependency fallback. Move into `/legacy`.

---

## Success Metrics (Personal)

- You use it daily for at least one article or PDF chunk
- Resume-from-progress works reliably enough to read a book over weeks
- Extension is fast enough that right-click → reading takes < 2 seconds
- Family members can install without help
