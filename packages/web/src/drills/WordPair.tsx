import { useEffect, useRef, useState } from "react";
import { pickRandom } from "../drillWords.js";

// Word-pair training: two words appear simultaneously with a fixation dot
// between them. Trains the eye to read two words in a single fixation,
// which is the core mechanic behind Bunching. Gap widens over time to push
// the saccade range.

export function WordPair() {
  const [running, setRunning] = useState(false);
  const [pair, setPair] = useState<[string, string]>(["", ""]);
  const [ms, setMs] = useState(700);
  const [gap, setGap] = useState(20); // % of stage width
  const [autoExpand, setAutoExpand] = useState(true);
  const [rounds, setRounds] = useState(0);
  const timer = useRef<number | null>(null);

  function next() {
    const [a, b] = pickRandom(2);
    setPair([a!, b!]);
    setRounds((n) => {
      const nn = n + 1;
      if (autoExpand && nn % 10 === 0) setGap((g) => Math.min(30, g + 1));
      return nn;
    });
  }

  useEffect(() => {
    if (!running) { if (timer.current) clearInterval(timer.current); return; }
    next();
    timer.current = window.setInterval(next, ms);
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, ms]);

  return (
    <div className="panel">
      <div className="panel-row">
        <div>
          <strong>Word pairs</strong>
          <div className="meta">Eyes on the dot. Read both words in a single fixation — don&apos;t move your eyes.</div>
        </div>
        <div className="meta" style={{ textAlign: "right" }}>Rounds: {rounds}</div>
      </div>

      <div className="peri-stage">
        <span className="peri-fix" aria-hidden="true" />
        <span className="peri-word side-left" style={{ right: `calc(50% + ${gap}%)` }}>{running ? pair[0] : ""}</span>
        <span className="peri-word side-right" style={{ left: `calc(50% + ${gap}%)` }}>{running ? pair[1] : ""}</span>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        <button className="primary" onClick={() => setRunning((v) => !v)}>
          {running ? "Stop" : "Start"}
        </button>
        <label className="row"><span className="meta">Speed</span>
          <input type="range" min={300} max={1500} step={50} value={ms}
            onChange={(e) => setMs(Number(e.target.value))} /> <span className="meta">{ms}ms</span>
        </label>
        <label className="row"><span className="meta">Gap</span>
          <input type="range" min={8} max={30} step={1} value={gap}
            onChange={(e) => setGap(Number(e.target.value))} /> <span className="meta">±{gap}%</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={autoExpand} onChange={(e) => setAutoExpand(e.target.checked)} />
          <span className="meta">Auto-widen every 10 rounds</span>
        </label>
      </div>
    </div>
  );
}
