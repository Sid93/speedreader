import { useEffect, useMemo, useRef, useState } from "react";
import { tokenize, getORP, createScheduler, type Scheduler } from "@speedreader/engine";
import { extractArticle } from "@speedreader/extractors";

const SPEED_PRESETS = [150, 300, 450, 600, 900];
const STAGED_KEY = "sr.staged";

type Staged =
  | { mode: "text"; title: string; text: string; at: number }
  | { mode: "url"; title: string; url: string; at: number };

export function ReaderApp() {
  const [title, setTitle] = useState("Speed Reader");
  const [text, setText] = useState<string | null>(null);
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
        setTitle(staged.title);
        if (staged.mode === "text") {
          setText(staged.text);
        } else {
          const r = await extractArticle(staged.url);
          setTitle(r.title || staged.title);
          setText(r.text);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (err) return <div className="wrap"><div className="error">{err}</div></div>;
  if (text === null) return <div className="wrap"><div className="meta">⏳ Extracting...</div></div>;
  return <Player title={title} text={text} />;
}

function Player({ title, text }: { title: string; text: string }) {
  const words = useMemo(() => tokenize(text), [text]);
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(300);
  const [fontSize, setFontSize] = useState(56);
  const [skipPunct, setSkipPunct] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [chunkSize, setChunkSize] = useState(1);
  const schedRef = useRef<Scheduler | null>(null);

  useEffect(() => {
    const s = createScheduler({
      words,
      wpm,
      skipPunct,
      chunkSize,
      onTick: (i) => setIndex(i),
      onFinish: () => setIsPlaying(false),
    });
    schedRef.current = s;
    return () => s.destroy();
  }, [words]);

  useEffect(() => { schedRef.current?.setWpm(wpm); }, [wpm]);
  useEffect(() => { schedRef.current?.setSkipPunct(skipPunct); }, [skipPunct]);
  useEffect(() => { schedRef.current?.setChunkSize(chunkSize); }, [chunkSize]);

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

      <div className="reader">
        <div className="word" style={{ fontSize: chunkSize === 1 ? fontSize : Math.round(fontSize / (1 + (chunkSize - 1) * 0.9)) }}>
          {chunk.map((w, i) => {
            if (i === centerIdx) {
              return (
                <span key={i} className="chunk-word center">
                  <span>{centerParts.before}</span>
                  <span className="orp">{centerParts.orp}</span>
                  <span>{centerParts.after}</span>
                </span>
              );
            }
            return <span key={i} className="chunk-word side">{w}</span>;
          })}
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
          <div className="progress"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>
        <div className="controls">
          <button onClick={() => { schedRef.current?.seek(0); setIsPlaying(false); }}>⏮</button>
          <button onClick={() => schedRef.current?.step(-1)}>⏪</button>
          <button className="primary play" onClick={toggle}>{isPlaying ? "⏸" : "▶"}</button>
          <button onClick={() => schedRef.current?.step(1)}>⏩</button>
          <button onClick={() => schedRef.current?.seek(words.length - 1)}>⏭</button>
        </div>
      </div>

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
      </div>
    </div>
  );
}
