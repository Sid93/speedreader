import { useEffect, useMemo, useRef, useState } from "react";
import { tokenize, getORP, createScheduler, sentenceStartAtOrBefore, skim, splitSentences, chunkLenAt, type Scheduler } from "@speedreader/engine";
import { imageIdForToken } from "@speedreader/extractors";
import {
  saveProgress,
  getProgress,
  recordWords,
  type LibraryDoc,
} from "@speedreader/storage";
import { BionicView } from "./BionicView.js";
import { useCameraAssist } from "./useCameraAssist.js";
import { Quiz } from "./Quiz.js";
import { SentenceFlash } from "./SentenceFlash.js";

type Mode = "rsvp" | "bionic" | "flash";

const SPEED_PRESETS = [150, 300, 450, 600, 900];

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "Serif", value: "Georgia, serif" },
  { label: "Sans", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" },
  { label: "Mono", value: "'SF Mono', Menlo, Consolas, monospace" },
  { label: "Atkinson", value: "'Atkinson Hyperlegible', sans-serif" },
  { label: "Dyslexic", value: "'OpenDyslexic', sans-serif" },
];

export function Reader({ doc, onBack }: { doc: LibraryDoc; onBack: () => void }) {
  const [skimMode, setSkimMode] = useState(false);
  const [skimRatio, setSkimRatio] = useState(0.25);
  const effectiveText = useMemo(() => (skimMode ? skim(doc.text, skimRatio) : doc.text), [doc.text, skimMode, skimRatio]);
  const words = useMemo(() => tokenize(effectiveText), [effectiveText]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(350);
  const [fontSize, setFontSize] = useState(95);
  const [skipPunct, setSkipPunct] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [chunkSize, setChunkSize] = useState(4);
  const [mode, setMode] = useState<Mode>("rsvp");
  const [naturalPauses, setNaturalPauses] = useState(true);
  const [adaptivePacing, setAdaptivePacing] = useState(true);
  const [bionicIntensity, setBionicIntensity] = useState(0.45);
  const [fontFamily, setFontFamily] = useState<string>(() =>
    localStorage.getItem("sr.fontFamily") ?? "Georgia, serif",
  );
  useEffect(() => { localStorage.setItem("sr.fontFamily", fontFamily); }, [fontFamily]);
  const [showQuiz, setShowQuiz] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [warmup, setWarmup] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [forwardOnly, setForwardOnly] = useState(false);
  const [chunkLadder, setChunkLadder] = useState(false);
  const [humReminder, setHumReminder] = useState(false);
  const [showHum, setShowHum] = useState(false);
  const [cameraAssist, setCameraAssist] = useState(() => localStorage.getItem("sr.cameraAssist") === "1");
  useEffect(() => { localStorage.setItem("sr.cameraAssist", cameraAssist ? "1" : "0"); }, [cameraAssist]);
  const [camToast, setCamToast] = useState<string | null>(null);
  const pausedByCameraRef = useRef(false);
  const lastBlinkWarnRef = useRef(0);
  const camActiveSinceRef = useRef(0);
  const [activeImageId, setActiveImageId] = useState<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const schedRef = useRef<Scheduler | null>(null);
  const lastStatIndexRef = useRef(0);
  const indexRef = useRef(0);
  const wpmRef = useRef(300);
  const hydratedRef = useRef(false);
  const chunkSizeRef = useRef(1);
  indexRef.current = index;
  wpmRef.current = wpm;
  hydratedRef.current = hydrated;
  chunkSizeRef.current = chunkSize;

  // Opt-in webcam assist (attention auto-pause + blink reminders). The hook
  // is inert (no camera, no model download) until the user enables it.
  const cam = useCameraAssist(cameraAssist && mode === "rsvp");
  useEffect(() => {
    if (cam.status !== "active") {
      camActiveSinceRef.current = 0;
      pausedByCameraRef.current = false;
      return;
    }
    if (!camActiveSinceRef.current) camActiveSinceRef.current = Date.now();
    if (!cam.present && schedRef.current?.getState().isPlaying) {
      // Give a 1s grace period before pausing — glances are fine.
      const t = setTimeout(() => {
        const s = schedRef.current;
        if (!s || !s.getState().isPlaying) return;
        s.pause();
        setIsPlaying(false);
        pausedByCameraRef.current = true;
        setCamToast("⏸ Paused — you looked away");
      }, 1000);
      return () => clearTimeout(t);
    }
    if (cam.present && pausedByCameraRef.current) {
      pausedByCameraRef.current = false;
      schedRef.current?.play();
      setIsPlaying(schedRef.current?.getState().isPlaying ?? false);
      setCamToast(null);
    }
  }, [cam.present, cam.status]);
  useEffect(() => {
    if (cam.status !== "active" || cam.blinkRatePerMin === null || !isPlaying) return;
    const activeFor = camActiveSinceRef.current ? Date.now() - camActiveSinceRef.current : 0;
    if (activeFor < 90_000) return;
    if (cam.blinkRatePerMin >= 6) return;
    if (Date.now() - lastBlinkWarnRef.current < 180_000) return;
    lastBlinkWarnRef.current = Date.now();
    setCamToast("👁 Blink break — your blink rate is low");
    const t = setTimeout(() => setCamToast((m) => (m?.startsWith("👁") ? null : m)), 4500);
    return () => clearTimeout(t);
  }, [cam.blinkRatePerMin, cam.status, isPlaying]);

  // Preload the next couple of images so the pause overlay opens instantly
  // instead of showing a blank while the CDN responds.
  const upcomingImages = useMemo(() => {
    const list: { at: number; id: number }[] = [];
    words.forEach((w, i) => {
      const id = imageIdForToken(w);
      if (id !== null) list.push({ at: i, id });
    });
    return list;
  }, [words]);
  const preloadedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const imgs = doc.images;
    if (!imgs?.length) return;
    for (const m of upcomingImages.filter((m) => m.at >= index).slice(0, 2)) {
      if (preloadedRef.current.has(m.id)) continue;
      const src = imgs.find((x) => x.id === m.id)?.src;
      if (!src) continue;
      preloadedRef.current.add(m.id);
      const im = new Image();
      im.referrerPolicy = "no-referrer";
      im.src = src;
    }
  }, [index, upcomingImages, doc.images]);

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
      warmup: warmup ? { startFactor: 0.7, durationMs: 30000 } : undefined,
      chunkAt: (i, size) => chunkLenAt(words, i, size),
      onTick: (i) => {
        setIndex(i);
        // Scan the whole displayed chunk, not just the first word — with
        // bunching on, a marker mid-chunk would otherwise be skipped.
        const len = chunkSizeRef.current > 1 ? chunkLenAt(words, i, chunkSizeRef.current) : 1;
        let imgId: number | null = null;
        for (const w of words.slice(i, i + len)) {
          imgId = imageIdForToken(w);
          if (imgId !== null) break;
        }
        if (imgId !== null) {
          schedRef.current?.pause();
          setIsPlaying(false);
          setActiveImageId(imgId);
          return;
        }
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

  // Never show raw ‹IMG:n› marker tokens in the display — swap them for a
  // picture glyph (the overlay shows the actual image when playback hits one).
  const displayWord = (w: string) => (imageIdForToken(w) !== null ? "🖼️" : w);
  // Phrase-aware chunk: same pure function the scheduler uses, so the words
  // on screen are exactly the words being timed.
  const chunkLen = chunkSize > 1 ? chunkLenAt(words, index, chunkSize) : 1;
  const chunk = words.slice(index, index + chunkLen).map(displayWord);
  const centerIdx = Math.floor((chunk.length - 1) / 2);
  const centerParts = chunk[centerIdx] ? getORP(chunk[centerIdx]!) : { before: "", orp: "", after: "" };
  const effectiveWpm = wpm; // wpm in scheduler is true words-per-minute
  const progress = words.length > 1 ? (index / (words.length - 1)) * 100 : 0;
  const wordsLeft = words.length - index - 1;
  const minLeft = Math.max(0, Math.ceil(wordsLeft / wpm));
  const secondsLeft = Math.max(0, Math.round((wordsLeft / wpm) * 60));
  const timeLeftLabel =
    wordsLeft <= 0 ? "Almost done" :
    secondsLeft < 60 ? `${secondsLeft}s left` :
    secondsLeft < 600 ? `${Math.floor(secondsLeft/60)}m ${String(secondsLeft%60).padStart(2,"0")}s left` :
    `${Math.ceil(secondsLeft/60)}m left`;

  // Section headings, detected heuristically: a short standalone paragraph
  // (≤8 words) with no terminal punctuation is almost always a heading in
  // extracted article text. Gives the scrubber tick marks and a "where am I"
  // label without any storage changes.
  const sections = useMemo<{ title: string; at: number; pct: number }[]>(() => {
    const secs: { title: string; at: number; pct: number }[] = [];
    let wordIdx = 0;
    for (const para of effectiveText.split(/\n{2,}/)) {
      const ws = para.trim().split(/\s+/).filter(Boolean);
      if (ws.length === 0) continue;
      const lastWord = ws[ws.length - 1]!;
      const isHeading =
        ws.length <= 8 &&
        !/[.!?,;:]$/.test(lastWord) &&
        /[A-Za-z]/.test(para) &&
        !ws.some((w) => /‹IMG:\d+›/.test(w));
      if (isHeading && wordIdx > 0) {
        secs.push({ title: ws.join(" "), at: wordIdx, pct: (wordIdx / Math.max(1, words.length - 1)) * 100 });
      }
      wordIdx += ws.length;
    }
    return secs;
  }, [effectiveText, words.length]);
  const currentSection = useMemo(() => {
    let cur: string | null = null;
    for (const s of sections) {
      if (s.at <= index) cur = s.title;
      else break;
    }
    return cur;
  }, [sections, index]);

  // Paragraph boundary positions, expressed as percentages of total length.
  const paragraphMarks = useMemo<number[]>(() => {
    const marks: number[] = [];
    if (words.length < 4) return marks;
    let wordIdx = 0;
    const re = /(\S+|\n\n+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(effectiveText)) !== null) {
      if (/^\n\n+/.test(m[0])) {
        marks.push((wordIdx / Math.max(1, words.length - 1)) * 100);
      } else {
        wordIdx++;
      }
    }
    return marks;
  }, [effectiveText, words.length]);

  return (
    <div className={["app", focusMode && "focus-mode", isPlaying && mode === "rsvp" && "playing"].filter(Boolean).join(" ")}>
      {!focusMode && (
        <div className="reader-header">
          <button className="header-btn" onClick={onBack} aria-label="Back to library">←</button>
          <div className="header-title">
            <div className="header-doc-title" title={doc.title}>{doc.title}</div>
            <div className="meta header-doc-meta">{words.length.toLocaleString()} words · ~{Math.ceil(words.length / wpm)} min</div>
          </div>
          <span style={{ width: 44 }} />
        </div>
      )}
      {focusMode && (
        <div className="focus-bar">
          <button className="focus-btn" onClick={() => setWpm((w) => Math.max(100, w - 25))} title="Slower (↓)">«</button>
          <span className="focus-label" title="Current WPM (use ↑/↓ to change)">{wpm}</span>
          <button className="focus-btn" onClick={() => setWpm((w) => Math.min(1000, w + 25))} title="Faster (↑)">»</button>
          <span className="focus-bar-sep" aria-hidden="true" />
          <button className="focus-btn" onClick={() => setFontSize((s) => Math.max(20, s - 4))} title="Smaller (−)">−</button>
          <span className="focus-label">{fontSize}px</span>
          <button className="focus-btn" onClick={() => setFontSize((s) => Math.min(140, s + 4))} title="Larger (+)">+</button>
          <span className="focus-bar-sep" aria-hidden="true" />
          <button className="focus-btn" onClick={() => setFocusMode(false)} title="Exit focus (Esc)">✕</button>
        </div>
      )}

      {!focusMode && (
      <div className="mode-switch">
        <button className={mode === "rsvp" ? "mode active" : "mode"} onClick={() => setMode("rsvp")}>⚡ RSVP</button>
        <button className={mode === "flash" ? "mode active" : "mode"} onClick={() => setMode("flash")} title="Sentence-at-a-time flash">🎬 Flash</button>
        <button className={mode === "bionic" ? "mode active" : "mode"} onClick={() => setMode("bionic")}>📖 Bionic</button>
        <button className="mode" onClick={() => setShowQuiz(true)} title="Test your recall">🧠 Quiz</button>
        <button className="mode" onClick={() => setFocusMode(true)} title="Distraction-free (F)">🎯 Focus</button>
        <button className={settingsOpen ? "mode active" : "mode"} onClick={() => setSettingsOpen((o) => !o)}
          title="Settings">⚙ {wpm} wpm · {chunkSize === 1 ? "1 word" : `${chunkSize}×`}</button>
        {cameraAssist && (
          <span className="meta cam-status" title={
            cam.status === "active" ? "Camera assist active — on-device only"
            : cam.status === "starting" ? "Camera starting…"
            : cam.status === "error" ? `Camera error: ${cam.error}` : "Camera assist"
          }>
            👁{cam.status === "active" ? "" : cam.status === "starting" ? " …" : " ⚠"}
          </span>
        )}
      </div>
      )}

      {showQuiz && (
        <Quiz
          text={doc.text}
          onClose={() => setShowQuiz(false)}
          onScore={(correct, total) => {
            if (chunkLadder && total > 0 && correct / total >= 0.7 && chunkSize < 5) {
              setChunkSize((c) => Math.min(5, c + 1));
            }
          }}
        />
      )}
      {showHum && <div className="hum-toast">🎵 Hum softly while reading</div>}
      {camToast && <div className="hum-toast">{camToast}</div>}

      {activeImageId !== null && (() => {
        const img = doc.images?.find((x) => x.id === activeImageId);
        if (!img) {
          schedRef.current?.step(1);
          setActiveImageId(null);
          return null;
        }
        const dismiss = () => {
          setActiveImageId(null);
          const s = schedRef.current;
          if (!s) return;
          // At the very end there is nothing to advance to — just stop, or the
          // clamped step would re-emit the same marker and reopen the overlay.
          if (indexRef.current + Math.max(1, chunkSizeRef.current) >= words.length) {
            setIsPlaying(false);
            return;
          }
          s.step(1);
          // "Continue" means continue reading: resume playback. If the next
          // chunk holds another image, onTick pauses again immediately, so
          // reflect the scheduler's actual state rather than assuming.
          s.play();
          setIsPlaying(s.getState().isPlaying);
        };
        return (
          <div className="image-overlay" onClick={dismiss} role="button" tabIndex={0}
               onKeyDown={(e) => { if (e.key === " " || e.key === "Enter" || e.key === "Escape") dismiss(); }}>
            <div className="image-card" onClick={(e) => e.stopPropagation()}>
              <ImageWithFallback src={img.src} alt={img.alt ?? ""} />
              {img.alt && <div className="image-caption meta">{img.alt}</div>}
              <div className="image-actions">
                <button className="primary" onClick={dismiss} autoFocus>Continue ▶</button>
              </div>
            </div>
          </div>
        );
      })()}

      {mode === "flash" ? (
        <SentenceFlash text={effectiveText} fontSize={Math.max(18, Math.round(fontSize * 0.42))} fontFamily={fontFamily} wpm={wpm} />
      ) : mode === "bionic" ? (
        <>
          <BionicView text={effectiveText} fontSize={Math.max(16, Math.round(fontSize * 0.38))} intensity={bionicIntensity} fontFamily={fontFamily} />
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
        {showContext && !focusMode && (
          <div className="context-ribbon" aria-hidden="true">
            {words.slice(Math.max(0, index - Math.max(2, chunkSize)), index).map(displayWord).join(" ") || " "}
          </div>
        )}
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
          <div className="context-ribbon" aria-hidden="true">
            {words.slice(index + chunkLen, index + chunkLen + Math.max(2, chunkSize)).map(displayWord).join(" ") || " "}
          </div>
        )}

        {!focusMode && <div style={{ width: "100%" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="meta scrub-label">
              Word {index + 1} of {words.length.toLocaleString()}
              {currentSection && <span className="section-label"> · {currentSection}</span>}
            </span>
            <span className="meta">{timeLeftLabel}</span>
          </div>
          <div className="scrubber-wrap">
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
            <div className="paragraph-marks" aria-hidden="true">
              {paragraphMarks.map((p, i) => (
                <span key={i} className="paragraph-tick" style={{ left: `${p}%` }} />
              ))}
              {sections.map((s, i) => (
                <span key={`s${i}`} className="section-tick" style={{ left: `${s.pct}%` }} title={s.title} />
              ))}
              {upcomingImages.map((m) => (
                <span key={`img${m.id}`} className="image-dot"
                  style={{ left: `${(m.at / Math.max(1, words.length - 1)) * 100}%` }} />
              ))}
            </div>
          </div>
        </div>}

        <div className="control-bar">
          <div className="speed-inline">
            <button className="speed-btn" onClick={() => setWpm((w) => Math.max(100, w - 25))} title="Slower">−</button>
            <span className="wpm-pill" title="Current WPM">
              <span className="wpm-num">{wpm}</span>
              <span className="wpm-unit">WPM</span>
            </span>
            <button className="speed-btn" onClick={() => setWpm((w) => Math.min(1000, w + 25))} title="Faster">+</button>
          </div>
          <div className="controls">
            {!forwardOnly && <button onClick={() => { schedRef.current?.seek(0); setIsPlaying(false); }} title="Rewind (R)">⏮</button>}
            {!forwardOnly && <button onClick={() => schedRef.current?.step(-1)} title="Prev (←)">⏪</button>}
            <button className="primary play" onClick={toggle}>{isPlaying ? "⏸" : "▶"}</button>
            <button onClick={() => schedRef.current?.step(1)} title="Next (→)">⏩</button>
            {!forwardOnly && <button onClick={() => schedRef.current?.seek(words.length - 1)} title="End">⏭</button>}
          </div>
        </div>
      </div>
      )}

      {!focusMode && (doc.links?.length ?? 0) > 0 && (
        <div className="panel link-panel">
          <div className="panel-row">
            <strong>🔗 Links in this article</strong>
            <span className="meta">{doc.links!.length} — the reader skips these; catch up here</span>
          </div>
          <div className="link-list">
            {doc.links!.map((l, i) => (
              <a key={i} className="link-row" href={l.href} target="_blank" rel="noreferrer noopener">
                <span className="link-text">{l.text}</span>
                <span className="link-href meta">{l.href}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {!focusMode && settingsOpen && (
      <>
      {(mode === "rsvp" || mode === "flash") && (
      <div className="panel" style={{ marginTop: 0 }}>
        <div className="panel-row">
          <strong>💨 Skim mode</strong>
          <label className="row">
            <input type="checkbox" checked={skimMode} onChange={(e) => setSkimMode(e.target.checked)} />
            <span className="meta">{skimMode ? `${Math.round(skimRatio * 100)}% of sentences` : "off"}</span>
          </label>
        </div>
        {skimMode && (
          <div className="row" style={{ marginTop: 8, gap: 12 }}>
            <span className="meta">How much</span>
            <input type="range" min={10} max={50} step={5} value={Math.round(skimRatio * 100)}
              onChange={(e) => setSkimRatio(Number(e.target.value) / 100)} />
            <span className="meta">{Math.round(skimRatio * 100)}%</span>
          </div>
        )}
        <div className="meta" style={{ marginTop: 8 }}>
          Picks the most informative sentences via TextRank. A long article becomes a quick summary you can still RSVP or Flash through.
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
          {[1, 2, 3, 4, 5].map((n) => (
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
          <label className="row" title="Uses the webcam to auto-pause when you look away and remind you to blink. Everything runs on this device — no video is recorded or sent anywhere.">
            <input type="checkbox" checked={cameraAssist} onChange={(e) => setCameraAssist(e.target.checked)} />
            <span className="meta">👁 Camera assist</span>
          </label>
        </div>
        {cameraAssist && (
          <div className="meta" style={{ marginTop: 8 }}>
            {cam.status === "error"
              ? <span style={{ color: "var(--red)" }}>Camera unavailable: {cam.error}</span>
              : cam.status === "starting"
              ? "Starting camera & loading the on-device model…"
              : "Camera assist is on: auto-pause when you look away, blink-rate reminders. Frames are analyzed locally in your browser and never stored or uploaded."}
          </div>
        )}
        <div className="meta" style={{ marginTop: 12 }}>
          <kbd>Space</kbd> play/pause · <kbd>←</kbd>/<kbd>→</kbd> step · <kbd>↑</kbd>/<kbd>↓</kbd> ±50 WPM · <kbd>R</kbd> rewind · <kbd>F</kbd> focus
        </div>
      </div>
      </>
      )}
    </div>
  );
}

function ImageWithFallback({ src, alt }: { src: string; alt: string }) {
  // Some CDNs block hotlinking; on error retry once through the weserv.nl
  // image proxy before giving up.
  const [stage, setStage] = useState<"direct" | "proxy" | "failed">("direct");
  useEffect(() => setStage("direct"), [src]);
  const shownSrc = stage === "proxy"
    ? `https://images.weserv.nl/?url=${encodeURIComponent(src)}`
    : src;
  if (stage === "failed") {
    return (
      <div style={{
        padding: "32px 24px", borderRadius: 10, background: "var(--surface-2)",
        textAlign: "center", color: "var(--text-muted)",
      }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>🖼️</div>
        <div className="meta" style={{ marginBottom: 6 }}>Image failed to load</div>
        <a href={src} target="_blank" rel="noreferrer noopener" className="meta"
           style={{ color: "var(--accent)", wordBreak: "break-all" }}>
          Open original
        </a>
      </div>
    );
  }
  return (
    <img
      src={shownSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setStage((s) => (s === "direct" ? "proxy" : "failed"))}
    />
  );
}
