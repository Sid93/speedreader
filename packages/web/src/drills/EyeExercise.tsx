import { useEffect, useRef, useState } from "react";

// Multi-component eye drill that targets the things that limit chunk reading:
// 1. Saccade range — a moving dot you track only with your eyes (head still),
//    progressively widens.
// 2. Pupil response — periods of dim/bright stage to flex the iris muscles.
// 3. Convergence — alternating near/far foci train the ciliary muscle that
//    governs depth of focus.
//
// All optical exercises are gentle by design. Stop and rest if anything
// feels strained — this is a training aid, not medical equipment.

type Phase = "saccade" | "pupil" | "convergence";

const PHASES: { id: Phase; label: string; hint: string }[] = [
  { id: "saccade", label: "Saccade range", hint: "Follow the dot with your eyes only — keep your head still." },
  { id: "pupil",   label: "Pupil response", hint: "Look at the dot. Stage will dim and brighten. Let your eyes adjust naturally." },
  { id: "convergence", label: "Near/far focus", hint: "Focus on the small dot, then on the wide ring — switch when each appears." },
];

const ROUND_MS = 60_000; // 60 seconds per phase

export function EyeExercise() {
  const [phase, setPhase] = useState<Phase>("saccade");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // Saccade: dot oscillates left-right with widening amplitude
  // Pupil:   stage opacity flips on slow cycle
  // Convergence: small/big focus alternates
  const t = elapsed / 1000;
  const widen = Math.min(1, t / 30);          // ramp to full span over 30s
  const period = 1.6;                          // seconds per swing
  const saccadeX = Math.sin((t / period) * Math.PI * 2) * (40 * (0.4 + 0.6 * widen)); // % of stage
  const pupilBright = Math.sin(t * (Math.PI / 2)) > 0; // 4s cycle
  const conv = Math.floor(t / 2) % 2 === 0;    // 2s alternation

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now() - elapsed;
    tickRef.current = window.setInterval(() => {
      const now = Date.now() - (startedAt.current ?? Date.now());
      if (now >= ROUND_MS) {
        setRunning(false);
        setElapsed(ROUND_MS);
      } else {
        setElapsed(now);
      }
    }, 50);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase]);

  function start(p: Phase) {
    setPhase(p);
    setElapsed(0);
    setRunning(true);
  }
  function stop() {
    setRunning(false);
  }

  const pct = Math.round((elapsed / ROUND_MS) * 100);
  const cur = PHASES.find((p) => p.id === phase)!;

  return (
    <div>
      <div className="panel">
        <div className="panel-row">
          <div>
            <strong>👁️ Eye exercise</strong>
            <div className="meta">{cur.hint}</div>
          </div>
          <div className="stat-value" style={{ fontSize: "1.4rem" }}>{Math.round(elapsed / 1000)}s</div>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
          {PHASES.map((p) => (
            <button key={p.id} className={p.id === phase ? "preset active" : "preset"} onClick={() => start(p.id)}>
              {p.label}
            </button>
          ))}
          {running ? (
            <button className="preset" onClick={stop}>⏸ Pause</button>
          ) : (
            <button className="preset" onClick={() => start(phase)}>▶ Start</button>
          )}
        </div>
        <div className="progress" style={{ marginTop: 12 }}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div
        className={"eye-stage" + (phase === "pupil" && running ? (pupilBright ? " bright" : " dim") : "")}
      >
        {phase === "saccade" && (
          <span
            className="eye-dot"
            style={{ transform: `translate(calc(-50% + ${saccadeX}vmin), -50%)` }}
          />
        )}
        {phase === "pupil" && (
          <span className="eye-dot" />
        )}
        {phase === "convergence" && (
          <>
            <span
              className={"eye-dot" + (conv ? " sharp" : " soft")}
              style={{ transform: "translate(-50%, -50%)" }}
            />
            <span
              className={"eye-ring" + (conv ? " soft" : " sharp")}
              style={{ transform: "translate(-50%, -50%)" }}
            />
          </>
        )}
      </div>

      {!running && elapsed >= ROUND_MS && (
        <div className="panel" style={{ marginTop: 12, textAlign: "center" }}>
          <div className="meta">Round complete</div>
          <button className="primary" style={{ marginTop: 10 }} onClick={() => start(phase)}>Another round</button>
        </div>
      )}
    </div>
  );
}
