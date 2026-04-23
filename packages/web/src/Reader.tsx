import { useEffect, useMemo, useRef, useState } from "react";
import { tokenize, getORP, createScheduler, type Scheduler } from "@speedreader/engine";
import {
  saveProgress,
  getProgress,
  recordWords,
  type LibraryDoc,
} from "@speedreader/storage";
import { BionicView } from "./BionicView.js";

type Mode = "rsvp" | "bionic";

const SPEED_PRESETS = [150, 300, 450, 600, 900];

export function Reader({ doc, onBack }: { doc: LibraryDoc; onBack: () => void }) {
  const words = useMemo(() => tokenize(doc.text), [doc.text]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [fontSize, setFontSize] = useState(56);
  const [skipPunct, setSkipPunct] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [chunkSize, setChunkSize] = useState(1);
  const [mode, setMode] = useState<Mode>("rsvp");
  const [hydrated, setHydrated] = useState(false);
  const schedRef = useRef<Scheduler | null>(null);
  const lastStatIndexRef = useRef(0);
  const indexRef = useRef(0);
  const wpmRef = useRef(300);
  const hydratedRef = useRef(false);
  indexRef.current = index;
  wpmRef.current = wpm;
  hydratedRef.current = hydrated;

  // Hydrate initial position from saved progress
  useEffect(() => {
    getProgress(doc.id).then((p) => {
      const startAt = p?.currentIndex ?? 0;
      setIndex(startAt);
      lastStatIndexRef.current = startAt;
      setHydrated(true);
    });
  }, [doc.id]);

  useEffect(() => {
    if (!hydrated) return;
    const s = createScheduler({
      words,
      wpm,
      skipPunct,
      chunkSize,
      onTick: (i) => setIndex(i),
      onFinish: () => setIsPlaying(false),
    });
    s.seek(index);
    schedRef.current = s;
    return () => s.destroy();
    // intentionally: rebuild only when word list or hydration changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, hydrated]);

  useEffect(() => { schedRef.current?.setWpm(wpm); }, [wpm]);
  useEffect(() => { schedRef.current?.setSkipPunct(skipPunct); }, [skipPunct]);
  useEffect(() => { schedRef.current?.setChunkSize(chunkSize); }, [chunkSize]);

  // Autosave progress on every tick (debounced via RAF-ish: every 10 words or pause)
  useEffect(() => {
    if (!hydrated) return;
    const delta = index - lastStatIndexRef.current;
    if (delta >= 10 || (!isPlaying && delta > 0)) {
      saveProgress(doc.id, index);
      recordWords(delta, wpm);
      lastStatIndexRef.current = index;
    }
  }, [index, isPlaying, hydrated, doc.id, wpm]);

  // Save once on unmount — only if we actually finished hydrating.
  // Guards against React StrictMode's dev double-mount, which would otherwise
  // save index=0 before the real progress loaded.
  useEffect(() => {
    return () => {
      if (!hydratedRef.current) return;
      const latestIndex = indexRef.current;
      const delta = latestIndex - lastStatIndexRef.current;
      saveProgress(doc.id, latestIndex);
      if (delta > 0) recordWords(delta, wpmRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save when the tab/window closes
  useEffect(() => {
    const onBeforeUnload = () => {
      if (hydratedRef.current) saveProgress(doc.id, indexRef.current);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [doc.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ": e.preventDefault(); toggle(); break;
        case "ArrowLeft": e.preventDefault(); schedRef.current?.step(-1); break;
        case "ArrowRight": e.preventDefault(); schedRef.current?.step(1); break;
        case "ArrowUp": e.preventDefault(); setWpm((w) => Math.min(1000, w + 50)); break;
        case "ArrowDown": e.preventDefault(); setWpm((w) => Math.max(100, w - 50)); break;
        case "r": case "R": schedRef.current?.seek(0); setIsPlaying(false); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggle() {
    const s = schedRef.current;
    if (!s) return;
    s.toggle();
    setIsPlaying(s.getState().isPlaying);
  }

  const chunk = words.slice(index, index + chunkSize);
  const centerIdx = Math.floor((chunk.length - 1) / 2);
  const centerParts = chunk[centerIdx] ? getORP(chunk[centerIdx]!) : { before: "", orp: "", after: "" };
  const effectiveWpm = wpm; // wpm in scheduler is true words-per-minute
  const progress = words.length > 1 ? (index / (words.length - 1)) * 100 : 0;
  const wordsLeft = words.length - index - 1;
  const minLeft = Math.max(0, Math.ceil(wordsLeft / wpm));

  return (
    <div className="app">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={onBack}>← Back</button>
        <div className="meta" style={{ textAlign: "right" }}>
          <strong>{doc.title}</strong>
          <div>{words.length.toLocaleString()} words · ~{Math.ceil(words.length / wpm)} min @ {wpm} WPM</div>
        </div>
      </div>

      <div className="mode-switch">
        <button className={mode === "rsvp" ? "mode active" : "mode"} onClick={() => setMode("rsvp")}>⚡ RSVP</button>
        <button className={mode === "bionic" ? "mode active" : "mode"} onClick={() => setMode("bionic")}>📖 Bionic</button>
      </div>

      {mode === "bionic" ? (
        <BionicView text={doc.text} fontSize={Math.max(16, Math.round(fontSize * 0.38))} />
      ) : (
      <div className="reader">
        <div className="word anchored" style={{ fontSize: chunkSize === 1 ? fontSize : Math.round(fontSize / (1 + (chunkSize - 1) * 0.9)) }}>
          <div className="half left">
            {chunk.slice(0, centerIdx).map((w, i) => (
              <span key={`L${i}`} className="chunk-word side">{w}</span>
            ))}
            {chunk[centerIdx] && <span className="chunk-word center">{centerParts.before}</span>}
          </div>
          <span className="orp anchor">{centerParts.orp || "·"}</span>
          <div className="half right">
            {chunk[centerIdx] && <span className="chunk-word center">{centerParts.after}</span>}
            {chunk.slice(centerIdx + 1).map((w, i) => (
              <span key={`R${i}`} className="chunk-word side">{w}</span>
            ))}
          </div>
        </div>

        {showContext && (
          <div className="context meta">
            <span>{index > 0 ? words[index - 1] : "—"}</span>
            <span style={{ opacity: 0.4 }}>···</span>
            <span>{index < words.length - 1 ? words[index + 1] : "—"}</span>
          </div>
        )}

        <div style={{ width: "100%" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="meta">Word {index + 1} of {words.length.toLocaleString()}</span>
            <span className="meta">{minLeft > 0 ? `~${minLeft} min left` : "Almost done"}</span>
          </div>
          <input
            type="range"
            className="scrubber"
            min={0}
            max={Math.max(0, words.length - 1)}
            value={index}
            onChange={(e) => { schedRef.current?.seek(Number(e.target.value)); setIsPlaying(false); }}
            aria-label="Scrub through words"
          />
        </div>

        <div className="controls">
          <button onClick={() => { schedRef.current?.seek(0); setIsPlaying(false); }} title="Rewind (R)">⏮</button>
          <button onClick={() => schedRef.current?.step(-1)} title="Prev (←)">⏪</button>
          <button className="primary play" onClick={toggle}>{isPlaying ? "⏸" : "▶"}</button>
          <button onClick={() => schedRef.current?.step(1)} title="Next (→)">⏩</button>
          <button onClick={() => schedRef.current?.seek(words.length - 1)} title="End">⏭</button>
        </div>
      </div>
      )}

      {mode === "rsvp" && (
      <>
      <div className="panel">
        <div className="panel-row">
          <strong>Speed</strong>
          <span className="meta">{wpm} WPM</span>
        </div>
        <input
          type="range" min={100} max={1000} step={25} value={wpm}
          onChange={(e) => setWpm(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <div className="presets">
          {SPEED_PRESETS.map((p) => (
            <button key={p} className={wpm === p ? "preset active" : "preset"} onClick={() => setWpm(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-row">
          <strong>Bunching</strong>
          <span className="meta">{chunkSize === 1 ? "off" : `${chunkSize} words/chunk · ${effectiveWpm * chunkSize} eff. WPM`}</span>
        </div>
        <div className="presets">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              className={chunkSize === n ? "preset active" : "preset"}
              onClick={() => setChunkSize(n)}
              title={n === 1 ? "Single word (RSVP)" : `${n} words at a time`}
            >
              {n === 1 ? "Off" : `${n}×`}
            </button>
          ))}
        </div>
      </div>
      </>
      )}

      <div className="panel">
        <div className="panel-row"><strong>Display</strong></div>
        <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
          <label className="row">
            <span className="meta">Font</span>
            <input type="range" min={28} max={96} value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))} />
            <span className="meta">{fontSize}px</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={showContext} onChange={(e) => setShowContext(e.target.checked)} />
            <span className="meta">Show context</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={skipPunct} onChange={(e) => setSkipPunct(e.target.checked)} />
            <span className="meta">Skip punctuation</span>
          </label>
        </div>
        <div className="meta" style={{ marginTop: 12 }}>
          <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>↑</kbd>/<kbd>↓</kbd> ±50 WPM · <kbd>R</kbd> rewind
        </div>
      </div>
    </div>
  );
}
