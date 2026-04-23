import { useEffect, useMemo, useRef, useState } from "react";
import { PeripheralColumns } from "./drills/PeripheralColumns.js";
import { WordPair } from "./drills/WordPair.js";
import { FixationFlash } from "./drills/FixationFlash.js";

type Drill = "schulte" | "columns" | "pairs" | "fixation";

export function Drills() {
  const [drill, setDrill] = useState<Drill>("schulte");

  return (
    <div>
      <div className="drill-picker">
        <button className={drill === "schulte" ? "mode active" : "mode"} onClick={() => setDrill("schulte")}>🧩 Schulte table</button>
        <button className={drill === "columns" ? "mode active" : "mode"} onClick={() => setDrill("columns")}>🔭 Peripheral columns</button>
        <button className={drill === "pairs" ? "mode active" : "mode"} onClick={() => setDrill("pairs")}>👀 Word pairs</button>
        <button className={drill === "fixation" ? "mode active" : "mode"} onClick={() => setDrill("fixation")}>⚡ Fixation flash</button>
      </div>

      {drill === "schulte" && <Schulte />}
      {drill === "columns" && <PeripheralColumns />}
      {drill === "pairs" && <WordPair />}
      {drill === "fixation" && <FixationFlash />}
    </div>
  );
}

// ── Schulte table (existing) ──────────────────────────────────────────────

const SIZES = [3, 4, 5, 6];

function shuffled(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) | 0;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function Schulte() {
  const [size, setSize] = useState(5);
  const [seed, setSeed] = useState(() => Date.now() & 0xffff);
  const [next, setNext] = useState(1);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [best, setBest] = useState<Record<number, number>>(() => {
    try { return JSON.parse(localStorage.getItem("sr.schulte.best") ?? "{}"); } catch { return {}; }
  });

  const cells = useMemo(() => shuffled(size * size, seed), [size, seed]);
  const finished = next > size * size;
  const tick = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt && !finished) {
      tick.current = window.setInterval(() => setElapsed(Date.now() - startedAt), 50);
      return () => { if (tick.current) clearInterval(tick.current); };
    }
  }, [startedAt, finished]);

  useEffect(() => {
    if (finished && startedAt) {
      const elapsedMs = Date.now() - startedAt;
      setElapsed(elapsedMs);
      const prev = best[size];
      if (prev === undefined || elapsedMs < prev) {
        const nb = { ...best, [size]: elapsedMs };
        setBest(nb);
        localStorage.setItem("sr.schulte.best", JSON.stringify(nb));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  function restart(newSize = size) {
    setSize(newSize);
    setSeed((s) => s + 1);
    setNext(1);
    setWrong(0);
    setStartedAt(null);
    setElapsed(0);
  }

  function onCell(val: number) {
    if (finished) return;
    if (!startedAt) setStartedAt(Date.now());
    if (val === next) setNext((n) => n + 1);
    else setWrong((w) => w + 1);
  }

  const secs = (elapsed / 1000).toFixed(1);
  const bestSecs = best[size] !== undefined ? (best[size]! / 1000).toFixed(1) : "—";

  return (
    <div>
      <div className="panel">
        <div className="panel-row">
          <div>
            <strong>Schulte table</strong>
            <div className="meta">Find {next} of {size * size}. Keep your eyes on the center. Uses peripheral vision.</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="meta">Best ({size}×{size}): {bestSecs}s</div>
            <div className="stat-value" style={{ fontSize: "1.4rem" }}>{secs}s</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
          {SIZES.map((n) => (
            <button key={n} className={n === size ? "preset active" : "preset"} onClick={() => restart(n)}>{n}×{n}</button>
          ))}
          <button className="preset" onClick={() => restart(size)}>↻ Restart</button>
          {wrong > 0 && <span className="meta" style={{ marginLeft: 10 }}>Misses: {wrong}</span>}
        </div>
      </div>

      <div className="schulte" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {cells.map((v, i) => (
          <button
            key={i}
            className={v < next ? "sc-cell done" : "sc-cell"}
            onClick={() => onCell(v)}
            disabled={finished}
          >
            {v}
          </button>
        ))}
        <div className="schulte-fixation" aria-hidden="true" />
      </div>

      {finished && (
        <div className="panel" style={{ marginTop: 12, textAlign: "center" }}>
          <div className="meta">Completed</div>
          <div className="stat-value" style={{ fontSize: "2rem" }}>{secs}s</div>
          <button className="primary" onClick={() => restart(size)} style={{ marginTop: 10 }}>Another round</button>
        </div>
      )}
    </div>
  );
}
