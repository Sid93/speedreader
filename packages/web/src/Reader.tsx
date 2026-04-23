import { useEffect, useMemo, useRef, useState } from "react";
import { tokenize, getORP, createScheduler, sentenceStartAtOrBefore, type Scheduler } from "@speedreader/engine";
import {
  saveProgress,
  getProgress,
  recordWords,
  type LibraryDoc,
} from "@speedreader/storage";
import { BionicView } from "./BionicView.js";
import { Quiz } from "./Quiz.js";

type Mode = "rsvp" | "bionic";

const SPEED_PRESETS = [150, 300, 450, 600, 900];

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Serif", value: "Georgia, serif" },
  { label: "Sans", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" },
  { label: "Mono", value: "'SF Mono', Menlo, Consolas, monospace" },
  { label: "Atkinson", value: "'Atkinson Hyperlegible', sans-serif" },
  { label: "Dyslexic", value: "'OpenDyslexic', sans-serif" },
];

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
  const [naturalPauses, setNaturalPauses] = useState(true);
  const [adaptivePacing, setAdaptivePacing] = useState(false);
  const [bionicIntensity, setBionicIntensity] = useState(0.45);
  const [fontFamily, setFontFamily] = useState<string>(() =>
    localStorage.getItem("sr.fontFamily") ?? "Georgia, serif",
  );
  useEffect(() => { localStorage.setItem("sr.fontFamily", fontFamily); }, [fontFamily]);
  const [showQuiz, setShowQuiz] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [warmup, setWarmup] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [forwardOnly, setForwardOnly] = useState(false);
  const [chunkLadder, setChunkLadder] = useState(false);
  const [humReminder, setHumReminder] = useState(false);
  const [showHum, setShowHum] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
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
      const raw = p?.currentIndex ?? 0;
      // Resume from the nearest earlier sentence start for easier re-entry.
      const startAt = raw > 5 ? sentenceStartAtOrBefore(words, raw, 40) : raw;
      setIndex(startAt);
      lastStatIndexRef.current = startAt;
      setHydrated(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  useEffect(() => {
    if (!hydrated) return;
    const s = createScheduler({
      words,
      wpm,
      skipPunct,
      chunkSize,
      sentencePauseMs: naturalPauses ? 250 : 0,
      commaPauseMs: naturalPauses ? 80 : 0,
      adaptivePacing,
      warmup: warmup ? { startFactor: 0.7, durationMs: 30000 } : null,
      onTick: (i) => {
        setIndex(i);
        if (metronome) playTick();
      },
      onFinish: () => { setIsPlaying(false); setShowQuiz(true); },
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
  useEffect(() => {
    schedRef.current?.setSentencePauseMs(naturalPauses ? 250 : 0);
    schedRef.current?.setCommaPauseMs(naturalPauses ? 80 : 0);
  }, [naturalPauses]);
  useEffect(() => { schedRef.current?.setAdaptivePacing(adaptivePacing); }, [adaptivePacing]);
  useEffect(() => {
    schedRef.current?.setWarmup(warmup ? { startFactor: 0.7, durationMs: 30000 } : null);
  }, [warmup]);

  function playTick() {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current!;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1200;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch { /* ignore */ }
  }

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
    const onVisibility = () => {
      if (document.hidden && schedRef.current?.getState().isPlaying) {
        schedRef.current.pause();
        setIsPlaying(false);
        if (hydratedRef.current) saveProgress(doc.id, indexRef.current);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [doc.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ": e.preventDefault(); toggle(); break;
        case "ArrowLeft": e.preventDefault(); if (!forwardOnly) schedRef.current?.step(-1); break;
        case "ArrowRight": e.preventDefault(); schedRef.current?.step(1); break;
        case "ArrowUp": e.preventDefault(); setWpm((w) => Math.min(1000, w + 50)); break;
        case "ArrowDown": e.preventDefault(); setWpm((w) => Math.max(100, w - 50)); break;
        case "r": case "R": schedRef.current?.seek(0); setIsPlaying(false); break;
        case "Escape": if (focusMode) { e.preventDefault(); setFocusMode(false); } break;
        case "f": case "F": e.preventDefault(); setFocusMode((v) => !v); break;
        case "+": case "=": e.preventDefault(); setFontSize((s) => Math.min(140, s + 4)); break;
        case "-": case "_": e.preventDefault(); setFontSize((s) => Math.max(20, s - 4)); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toggle() {
    const s = schedRef.current;
    if (!s) return;
    const wasPlaying = s.getState().isPlaying;
    s.toggle();
    const nowPlaying = s.getState().isPlaying;
    setIsPlaying(nowPlaying);
    if (!wasPlaying && nowPlaying && humReminder) {
      setShowHum(true);
      setTimeout(() => setShowHum(false), 2800);
    }
  }

  const chunk = words.slice(index, index + chunkSize);
  const centerIdx = Math.floor((chunk.length - 1) / 2);
  const centerParts = chunk[centerIdx] ? getORP(chunk[centerIdx]!) : { before: "", orp: "", after: "" };
  const effectiveWpm = wpm; // wpm in scheduler is true words-per-minute
  const progress = words.length > 1 ? (index / (words.length - 1)) * 100 : 0;
  const wordsLeft = words.length - index - 1;
  const minLeft = Math.max(0, Math.ceil(wordsLeft / wpm));

  return (
    <div className={focusMode ? "app focus-mode" : "app"}>
      {!focusMode && (
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={onBack}>← Back</button>
          <div className="meta" style={{ textAlign: "right" }}>
            <strong>{doc.title}</strong>
            <div>{words.length.toLocaleString()} words · ~{Math.ceil(words.length / wpm)} min @ {wpm} WPM</div>
          </div>
        </div>
      )}
      {focusMode && (
        <div className="focus-bar">
          <button className="focus-btn" onClick={() => setFontSize((s) => Math.max(20, s - 4))} title="Smaller (−)">−</button>
          <span className="focus-label">{fontSize}px</span>
          <button className="focus-btn" onClick={() => setFontSize((s) => Math.min(140, s + 4))} title="Larger (+)">+</button>
          <button className="focus-btn" onClick={() => setFocusMode(false)} title="Exit focus (Esc)">✕</button>
        </div>
      )}

      {!focusMode && (
      <div className="mode-switch">
        <button className={mode === "rsvp" ? "mode active" : "mode"} onClick={() => setMode("rsvp")}>⚡ RSVP</button>
        <button className={mode === "bionic" ? "mode active" : "mode"} onClick={() => setMode("bionic")}>📖 Bionic</button>
        <button className="mode" onClick={() => setShowQuiz(true)} title="Test your recall">🧠 Quiz</button>
        <button className="mode" onClick={() => setFocusMode(true)} title="Distraction-free (F)">🎯 Focus</button>
      </div>
      )}

      {showQuiz && (
        <Quiz
          text={doc.text}
          onClose={() => setShowQuiz(false)}
          onScore={(correct, total) => {
            if (chunkLadder && total > 0 && correct / total >= 0.7 && chunkSize < 4) {
              setChunkSize((c) => Math.min(4, c + 1));
            }
          }}
        />
      )}
      {showHum && <div className="hum-toast">🎵 Hum softly while reading</div>}

      {mode === "bionic" ? (
        <>
          <BionicView text={doc.text} fontSize={Math.max(16, Math.round(fontSize * 0.38))} intensity={bionicIntensity} fontFamily={fontFamily} />
          <div className="panel">
            <div className="panel-row">
              <strong>Bionic intensity</strong>
              <span className="meta">{Math.round(bionicIntensity * 100)}% letters bolded</span>
            </div>
            <div className="presets">
              {[0.3, 0.45, 0.6].map((v) => (
                <button key={v} className={Math.abs(bionicIntensity - v) < 0.01 ? "preset active" : "preset"}
                  onClick={() => setBionicIntensity(v)}>
                  {Math.round(v * 100)}%
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
      <div className="reader">
        <div className="word anchored" style={{ fontSize: chunkSize === 1 ? fontSize : Math.round(fontSize / (1 + (chunkSize - 1) * 0.9)), fontFamily }}>
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

        {showContext && !focusMode && (
          <div className="context meta">
            <span>{index > 0 ? words[index - 1] : "—"}</span>
            <span style={{ opacity: 0.4 }}>···</span>
            <span>{index < words.length - 1 ? words[index + 1] : "—"}</span>
          </div>
        )}

        {!focusMode && <div style={{ width: "100%" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="meta">Word {index + 1} of {words.length.toLocaleString()}</span>
            <span className="meta">{minLeft > 0 ? `~${minLeft} min left` : "Almost done"}</span>
          </div>
          {!forwardOnly ? (
            <input
              type="range"
              className="scrubber"
              min={0}
              max={Math.max(0, words.length - 1)}
              value={index}
              onChange={(e) => { schedRef.current?.seek(Number(e.target.value)); setIsPlaying(false); }}
              aria-label="Scrub through words"
            />
          ) : (
            <div className="progress" style={{ marginTop: 10 }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>}

        <div className="controls">
          {!forwardOnly && <button onClick={() => { schedRef.current?.seek(0); setIsPlaying(false); }} title="Rewind (R)">⏮</button>}
          {!forwardOnly && <button onClick={() => schedRef.current?.step(-1)} title="Prev (←)">⏪</button>}
          <button className="primary play" onClick={toggle}>{isPlaying ? "⏸" : "▶"}</button>
          <button onClick={() => schedRef.current?.step(1)} title="Next (→)">⏩</button>
          {!forwardOnly && <button onClick={() => schedRef.current?.seek(words.length - 1)} title="End">⏭</button>}
        </div>
      </div>
      )}

      {mode === "rsvp" && !focusMode && (
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

      {!focusMode && <div className="panel">
        <div className="panel-row"><strong>Display</strong></div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.label}
              className={fontFamily === f.value ? "preset active" : "preset"}
              onClick={() => setFontFamily(f.value)}
              style={{ fontFamily: f.value, fontSize: "0.95rem" }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 24, flexWrap: "wrap" }}>
          <label className="row">
            <span className="meta">Size</span>
            <input type="range" min={28} max={140} value={fontSize}
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
          <label className="row" title="Extra ~250ms after . ! ? and ~80ms after , ; :">
            <input type="checkbox" checked={naturalPauses} onChange={(e) => setNaturalPauses(e.target.checked)} />
            <span className="meta">Natural pauses</span>
          </label>
          <label className="row" title="Longer words get proportionally more time">
            <input type="checkbox" checked={adaptivePacing} onChange={(e) => setAdaptivePacing(e.target.checked)} />
            <span className="meta">Adaptive pacing</span>
          </label>
          <label className="row" title="Start 30% slower and ramp to full speed over 30 seconds">
            <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} />
            <span className="meta">Warmup ramp</span>
          </label>
          <label className="row" title="Soft click sound on every word — suppresses subvocalization">
            <input type="checkbox" checked={metronome} onChange={(e) => setMetronome(e.target.checked)} />
            <span className="meta">Metronome tick</span>
          </label>
          <label className="row" title="Disables the scrubber and the rewind/prev buttons. Forces forward-only reading to break the re-read habit.">
            <input type="checkbox" checked={forwardOnly} onChange={(e) => setForwardOnly(e.target.checked)} />
            <span className="meta">Forward-only (no regression)</span>
          </label>
          <label className="row" title="After each quiz: if you score ≥70%, the Bunching size auto-bumps by one (up to 4×).">
            <input type="checkbox" checked={chunkLadder} onChange={(e) => setChunkLadder(e.target.checked)} />
            <span className="meta">Chunk ladder</span>
          </label>
          <label className="row" title="Pops a 'Hum softly' reminder when you press Play. Humming blocks the inner voice that caps WPM.">
            <input type="checkbox" checked={humReminder} onChange={(e) => setHumReminder(e.target.checked)} />
            <span className="meta">Hum reminder</span>
          </label>
        </div>
        <div className="meta" style={{ marginTop: 12 }}>
          <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>↑</kbd>/<kbd>↓</kbd> ±50 WPM · <kbd>R</kbd> rewind · <kbd>F</kbd> focus
        </div>
      </div>}
    </div>
  );
}
