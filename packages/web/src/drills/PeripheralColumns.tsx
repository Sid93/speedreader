import { useEffect, useRef, useState } from "react";
import { pickRandom } from "../drillWords.js";

// Peripheral column trainer: 3 words flash simultaneously, one in each column.
// Keep your eyes locked on the center dot; use peripheral vision to catch
// the left and right words. Tighter gaps = faster eye span; wider = harder.

export function PeripheralColumns() {
  const [running, setRunning] = useState(false);
  const [cols, setCols] = useState<[string, string, string]>(["", "", ""]);
  const [ms, setMs] = useState(700);     // display duration
  const [gap, setGap] = useState(140);   // horizontal gap in px per side
  const [rounds, setRounds] = useState(0);
  const timer = useRef<number | null>(null);

  function next() {
    const [l, c, r] = pickRandom(3);
    setCols([l!, c!, r!]);
    setRounds((n) => n + 1);
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
          <strong>Peripheral columns</strong>
          <div className="meta">Eyes on the purple dot. Read the side words using peripheral vision.</div>
        </div>
        <div className="meta" style={{ textAlign: "right" }}>Rounds: {rounds}</div>
      </div>

      <div className="peri-stage">
        <div className="peri-row" style={{ gap: `${gap}px` }}>
          <span className="peri-word">{running ? cols[0] : ""}</span>
          <span className="peri-fix" aria-hidden="true" />
          <span className="peri-word">{running ? cols[2] : ""}</span>
        </div>
        <div className="peri-center meta">{running ? cols[1] : ""}</div>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        <button className="primary" onClick={() => setRunning((v) => !v)}>
          {running ? "Stop" : "Start"}
        </button>
        <label className="row"><span className="meta">Speed</span>
          <input type="range" min={300} max={1500} step={50} value={ms}
            onChange={(e) => setMs(Number(e.target.value))} /> <span className="meta">{ms}ms</span>
        </label>
        <label className="row"><span className="meta">Span</span>
          <input type="range" min={80} max={360} step={20} value={gap}
            onChange={(e) => setGap(Number(e.target.value))} /> <span className="meta">{gap}px</span>
        </label>
      </div>
    </div>
  );
}
