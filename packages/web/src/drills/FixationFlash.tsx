import { useEffect, useRef, useState } from "react";
import { DRILL_WORDS, pickRandom } from "../drillWords.js";

// Fixation flash: briefly show one word, hide it, then force a multiple-
// choice recall. Trains single-glance word recognition at short durations.
// Shorter ms = harder. Score = correct / attempted.

type Phase = "idle" | "flash" | "quiz";

export function FixationFlash() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [ms, setMs] = useState(200);
  const [word, setWord] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [correct, setCorrect] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [lastResult, setLastResult] = useState<null | "right" | "wrong">(null);
  const hideTimer = useRef<number | null>(null);

  function start() {
    const [w] = pickRandom(1);
    const distractors: string[] = [];
    while (distractors.length < 3) {
      const d = DRILL_WORDS[Math.floor(Math.random() * DRILL_WORDS.length)]!;
      if (d !== w && !distractors.includes(d)) distractors.push(d);
    }
    // Shuffle options
    const opts = [w!, ...distractors].sort(() => Math.random() - 0.5);
    setWord(w!);
    setOptions(opts);
    setPhase("flash");
    hideTimer.current = window.setTimeout(() => setPhase("quiz"), ms);
  }

  function pick(opt: string) {
    const ok = opt === word;
    setLastResult(ok ? "right" : "wrong");
    setCorrect((c) => c + (ok ? 1 : 0));
    setAttempted((a) => a + 1);
    // Next round after brief feedback
    setTimeout(() => {
      setLastResult(null);
      start();
    }, 500);
  }

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  return (
    <div className="panel">
      <div className="panel-row">
        <div>
          <strong>Fixation flash</strong>
          <div className="meta">One word will appear for {ms}ms. After it disappears, pick the word you saw.</div>
        </div>
        <div className="meta" style={{ textAlign: "right" }}>
          Score: {correct}/{attempted}{" "}
          {attempted > 0 && <span>({Math.round((correct / attempted) * 100)}%)</span>}
        </div>
      </div>

      <div className="flash-stage">
        {phase === "flash" && <span className="flash-word">{word}</span>}
        {phase === "idle" && <span className="meta">Press Start to begin.</span>}
        {phase === "quiz" && (
          <div className="flash-options">
            <div className="meta" style={{ marginBottom: 8 }}>Which word did you see?</div>
            <div className="quiz-options">
              {options.map((opt) => (
                <button key={opt}
                  className={
                    lastResult && opt === word ? "quiz-opt correct" :
                    lastResult === "wrong" && opt !== word ? "quiz-opt" :
                    "quiz-opt"
                  }
                  onClick={() => pick(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        <button className="primary" onClick={start}>
          {phase === "idle" ? "Start" : "Next"}
        </button>
        <label className="row"><span className="meta">Flash</span>
          <input type="range" min={60} max={500} step={20} value={ms}
            onChange={(e) => setMs(Number(e.target.value))} /> <span className="meta">{ms}ms</span>
        </label>
        <button onClick={() => { setCorrect(0); setAttempted(0); }}>Reset score</button>
      </div>
    </div>
  );
}
