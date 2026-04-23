import { useEffect, useMemo, useRef, useState } from "react";
import { splitSentences } from "@speedreader/engine";

// Blink reader: show a whole sentence for long enough to read it, then blank
// briefly, then the next sentence. Duration scales with sentence length so
// longer ones get more time. Forces chunk parsing instead of linear reading.

export function SentenceFlash({
  text,
  fontSize,
  fontFamily,
  wpm,
}: {
  text: string;
  fontSize: number;
  fontFamily?: string;
  wpm: number;
}) {
  const sentences = useMemo(() => splitSentences(text), [text]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [gapVisible, setGapVisible] = useState(true);
  const timer = useRef<number | null>(null);

  function durationFor(s: string): number {
    // Words / WPM -> minutes, then ms. Clamp for very short/long sentences.
    const w = s.split(/\s+/).length;
    const base = (w / Math.max(150, wpm)) * 60000;
    return Math.max(500, Math.min(base, 6000));
  }

  useEffect(() => {
    if (!playing) { if (timer.current) clearTimeout(timer.current); return; }
    if (index >= sentences.length) { setPlaying(false); return; }
    setGapVisible(true);
    const showMs = durationFor(sentences[index]!);
    timer.current = window.setTimeout(() => {
      // Short blink-off then advance
      setGapVisible(false);
      timer.current = window.setTimeout(() => {
        setIndex((i) => i + 1);
      }, 160);
    }, showMs);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, index, sentences, wpm]);

  const current = sentences[index] ?? "";
  const pct = sentences.length > 1 ? (index / (sentences.length - 1)) * 100 : 0;

  return (
    <div className="reader flash-reader">
      <div className="flash-sentence" style={{ fontSize, fontFamily, opacity: gapVisible ? 1 : 0.0 }}>
        {current}
      </div>
      <div style={{ width: "100%" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="meta">Sentence {Math.min(index + 1, sentences.length)} of {sentences.length}</span>
          <span className="meta">{Math.round(pct)}%</span>
        </div>
        <div className="progress" style={{ marginTop: 8 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="controls">
        <button onClick={() => { setIndex(0); setPlaying(false); }} title="Rewind">⏮</button>
        <button onClick={() => setIndex((i) => Math.max(0, i - 1))} title="Prev">⏪</button>
        <button className="primary play" onClick={() => setPlaying((p) => !p)}>{playing ? "⏸" : "▶"}</button>
        <button onClick={() => setIndex((i) => Math.min(sentences.length - 1, i + 1))} title="Next">⏩</button>
        <button onClick={() => setIndex(sentences.length - 1)} title="End">⏭</button>
      </div>
    </div>
  );
}
