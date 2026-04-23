import { useEffect, useMemo, useRef, useState } from "react";
import { tokenize, getORP, createScheduler, type Scheduler } from "@speedreader/engine";
import { extractArticle } from "@speedreader/extractors";
import { saveDoc, saveProgress, getProgress, recordWords, type LibraryDoc } from "@speedreader/storage";
import { bionicSplit, sentenceStartAtOrBefore, buildQuiz, type QuizQuestion } from "@speedreader/engine";

type Mode = "rsvp" | "bionic";

function Quiz({ text, onClose }: { text: string; onClose: () => void }) {
  const [seed, setSeed] = useState(Date.now() & 0xffff);
  const questions = useMemo<QuizQuestion[]>(() => buildQuiz(text, { count: 3, seed }), [text, seed]);
  const [picks, setPicks] = useState<(string | null)[]>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  if (questions.length === 0) {
    return <div className="panel"><div className="meta">Not enough text to build a quiz.</div><button onClick={onClose} style={{ marginTop: 10 }}>Close</button></div>;
  }

  const correct = questions.filter((q, i) => picks[i]?.toLowerCase() === q.answer.toLowerCase()).length;
  const allAnswered = picks.every((p) => p !== null);

  return (
    <div className="quiz">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <strong>🧠 Quick comprehension quiz</strong>
        <button onClick={onClose}>✕</button>
      </div>
      {questions.map((q, qi) => (
        <div key={qi} className="panel" style={{ marginTop: 10 }}>
          <div className="meta" style={{ marginBottom: 6 }}>Question {qi + 1} of {questions.length}</div>
          <div style={{ lineHeight: 1.5, marginBottom: 10 }}>
            {q.before} <span className="cloze-blank">{submitted ? q.answer : "____"}</span> {q.after}
          </div>
          <div className="quiz-options">
            {q.options.map((opt) => {
              const picked = picks[qi] === opt;
              const isAnswer = opt.toLowerCase() === q.answer.toLowerCase();
              let cls = "quiz-opt";
              if (submitted) { if (isAnswer) cls += " correct"; else if (picked) cls += " wrong"; }
              else if (picked) cls += " picked";
              return (
                <button key={opt} className={cls} disabled={submitted}
                  onClick={() => setPicks((prev) => prev.map((p, i) => (i === qi ? opt : p)))}>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!submitted ? (
        <button className="primary" disabled={!allAnswered} onClick={() => setSubmitted(true)} style={{ marginTop: 12 }}>Submit →</button>
      ) : (
        <div className="quiz-result">
          <div className="stat-value" style={{ fontSize: "1.3rem" }}>{correct} / {questions.length}</div>
          <div className="row" style={{ gap: 8, justifyContent: "center" }}>
            <button onClick={() => { setSeed((s) => s + 1); setPicks(questions.map(() => null)); setSubmitted(false); }}>New questions</button>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BionicView({ text, fontSize }: { text: string; fontSize: number }) {
  const paragraphs = text.split(/\n\s*\n/);
  return (
    <div className="bionic" style={{ fontSize }}>
      {paragraphs.map((p, pi) => (
        <p key={pi}>
          {p.split(/\s+/).filter(Boolean).map((w, wi) => {
            const { bold, rest } = bionicSplit(w);
            return (
              <span key={wi} className="bw"><b>{bold}</b><span>{rest}</span>{" "}</span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

const SPEED_PRESETS = [150, 300, 450, 600, 900];
const STAGED_KEY = "sr.staged";

type Staged =
  | { mode: "text"; title: string; text: string; at: number }
  | { mode: "url"; title: string; url: string; at: number };

export function ReaderApp() {
  const [doc, setDoc] = useState<LibraryDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const got = await chrome.storage.local.get(STAGED_KEY);
        const staged = got[STAGED_KEY] as Staged | undefined;
        if (!staged) {
          setErr(
            "Nothing to read yet. Right-click any page or selection and choose 'Speed read ...'",
          );
          return;
        }
        let title = staged.title;
        let text = "";
        let source: LibraryDoc["source"] = "text";
        if (staged.mode === "text") {
          text = staged.text;
          source = "text";
        } else {
          const r = await extractArticle(staged.url);
          title = r.title || staged.title;
          text = r.text;
          source = "article";
        }
        const wordCount = tokenize(text).length;
        const saved = await saveDoc({ title, text, source, wordCount });
        setDoc(saved);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (err) return <div className="wrap"><div className="error">{err}</div></div>;
  if (!doc) return <div className="wrap"><div className="meta">⏳ Extracting...</div></div>;
  return <Player doc={doc} />;
}

function Player({ doc }: { doc: LibraryDoc }) {
  const { title, text } = doc;
  const words = useMemo(() => tokenize(text), [text]);
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
  const [showQuiz, setShowQuiz] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const schedRef = useRef<Scheduler | null>(null);
  const indexRef = useRef(0);
  const wpmRef = useRef(300);
  const hydratedRef = useRef(false);
  const lastStatIndexRef = useRef(0);
  indexRef.current = index;
  wpmRef.current = wpm;
  hydratedRef.current = hydrated;

  useEffect(() => {
    getProgress(doc.id).then((p) => {
      const raw = p?.currentIndex ?? 0;
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
      onTick: (i) => setIndex(i),
      onFinish: () => { setIsPlaying(false); setShowQuiz(true); },
    });
    s.seek(index);
    schedRef.current = s;
    return () => s.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const delta = index - lastStatIndexRef.current;
    if (delta >= 10 || (!isPlaying && delta > 0)) {
      saveProgress(doc.id, index);
      recordWords(delta, wpm);
      lastStatIndexRef.current = index;
    }
  }, [index, isPlaying, hydrated, doc.id, wpm]);

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

  useEffect(() => { schedRef.current?.setWpm(wpm); }, [wpm]);
  useEffect(() => { schedRef.current?.setSkipPunct(skipPunct); }, [skipPunct]);
  useEffect(() => { schedRef.current?.setChunkSize(chunkSize); }, [chunkSize]);
  useEffect(() => {
    schedRef.current?.setSentencePauseMs(naturalPauses ? 250 : 0);
    schedRef.current?.setCommaPauseMs(naturalPauses ? 80 : 0);
  }, [naturalPauses]);
  useEffect(() => { schedRef.current?.setAdaptivePacing(adaptivePacing); }, [adaptivePacing]);

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
  const progress = words.length > 1 ? (index / (words.length - 1)) * 100 : 0;
  const minLeft = Math.max(0, Math.ceil((words.length - index - 1) / wpm));

  return (
    <div className="wrap">
      <header>
        <h1>Speed <span>Reader</span></h1>
        <div className="meta" style={{ textAlign: "right" }}>
          <strong>{title}</strong>
          <div>{words.length.toLocaleString()} words · ~{Math.ceil(words.length / wpm)} min @ {wpm} WPM</div>
        </div>
      </header>

      <div className="mode-switch">
        <button className={mode === "rsvp" ? "mode active" : "mode"} onClick={() => setMode("rsvp")}>⚡ RSVP</button>
        <button className={mode === "bionic" ? "mode active" : "mode"} onClick={() => setMode("bionic")}>📖 Bionic</button>
        <button className="mode" onClick={() => setShowQuiz(true)}>🧠 Quiz</button>
      </div>

      {showQuiz && <Quiz text={doc.text} onClose={() => setShowQuiz(false)} />}

      {mode === "bionic" ? (
        <BionicView text={doc.text} fontSize={Math.max(14, Math.round(fontSize * 0.36))} />
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
          />
        </div>
        <div className="controls">
          <button onClick={() => { schedRef.current?.seek(0); setIsPlaying(false); }}>⏮</button>
          <button onClick={() => schedRef.current?.step(-1)}>⏪</button>
          <button className="primary play" onClick={toggle}>{isPlaying ? "⏸" : "▶"}</button>
          <button onClick={() => schedRef.current?.step(1)}>⏩</button>
          <button onClick={() => schedRef.current?.seek(words.length - 1)}>⏭</button>
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
        <input type="range" min={100} max={1000} step={25} value={wpm}
          onChange={(e) => setWpm(Number(e.target.value))} style={{ width: "100%" }} />
        <div className="presets">
          {SPEED_PRESETS.map((p) => (
            <button key={p} className={wpm === p ? "preset active" : "preset"} onClick={() => setWpm(p)}>{p}</button>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-row">
          <strong>Bunching</strong>
          <span className="meta">{chunkSize === 1 ? "off" : `${chunkSize} words/chunk · ${wpm * chunkSize} eff. WPM`}</span>
        </div>
        <div className="presets">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} className={chunkSize === n ? "preset active" : "preset"} onClick={() => setChunkSize(n)}>
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
          <label className="row" title="Extra pause after . ! ? and , ; :">
            <input type="checkbox" checked={naturalPauses} onChange={(e) => setNaturalPauses(e.target.checked)} />
            <span className="meta">Natural pauses</span>
          </label>
          <label className="row" title="Longer words get proportionally more time">
            <input type="checkbox" checked={adaptivePacing} onChange={(e) => setAdaptivePacing(e.target.checked)} />
            <span className="meta">Adaptive pacing</span>
          </label>
        </div>
      </div>
    </div>
  );
}
