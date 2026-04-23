import { useEffect, useMemo, useRef, useState } from "react";
import { tokenize, getORP, createScheduler, buildQuiz, type Scheduler, type QuizQuestion } from "@speedreader/engine";
import { recordBenchmark } from "@speedreader/storage";

// Public-domain passage tuned to ~250 words with moderate vocabulary.
// Content is self-referential on purpose so readers can make sense of it
// from context during the quiz.
const PASSAGE = `Speed reading is a collection of techniques used to increase how quickly a reader can understand written material. It is not a single trick but a toolkit of habits that reduce backtracking, limit inner speech, and expand the visual field so that more words are captured in a single glance. Most untrained adults read at roughly two hundred and fifty words a minute, a pace shaped more by habit than by the eye itself. With practice, a reader can learn to recognise words without silently pronouncing them, to take in groups of words at once, and to stop skipping back to re-read lines that the mind already understood. The result is not magic. Comprehension stays close to normal if the reader also trains recall and regularly checks that they still grasp the core ideas. A common mistake is to push speed until the page becomes a blur. The better path is steady progress guided by short practice sessions, honest self-testing, and a willingness to slow down on genuinely difficult passages. Some writing, such as dense technical papers or poetry, resists faster reading by design. Most articles, emails, and popular books, however, are written with far more words than the ideas themselves strictly need. Speed reading, then, is less about speed for its own sake and more about learning to match your pace to the text so that time spent reading actually turns into time spent understanding.`;

type Phase = "intro" | "reading" | "quiz" | "result";

export function Benchmark({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("intro");
  const words = useMemo(() => tokenize(PASSAGE), []);
  const [index, setIndex] = useState(0);
  const [wpm, setWpm] = useState(350);
  const schedRef = useRef<Scheduler | null>(null);
  const startedAt = useRef<number | null>(null);
  const finishedAt = useRef<number | null>(null);
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [picks, setPicks] = useState<(string | null)[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{ wpm: number; pct: number; trueWpm: number } | null>(null);

  function start() {
    startedAt.current = Date.now();
    setPhase("reading");
    const s = createScheduler({
      words,
      wpm,
      skipPunct: true,
      sentencePauseMs: 250,
      commaPauseMs: 80,
      onTick: (i) => setIndex(i),
      onFinish: () => {
        finishedAt.current = Date.now();
        const q = buildQuiz(PASSAGE, { count: 4, seed: 99 });
        setQuiz(q);
        setPicks(q.map(() => null));
        setPhase("quiz");
      },
    });
    schedRef.current = s;
    s.play();
  }

  useEffect(() => () => { schedRef.current?.destroy(); }, []);

  async function submit() {
    setSubmitted(true);
    const correct = quiz.filter((q, i) => picks[i]?.toLowerCase() === q.answer.toLowerCase()).length;
    const pct = Math.round((correct / Math.max(1, quiz.length)) * 100);
    const actualWpm = startedAt.current && finishedAt.current
      ? Math.round((words.length / ((finishedAt.current - startedAt.current) / 60000)))
      : wpm;
    const trueWpm = Math.round(actualWpm * (pct / 100));
    await recordBenchmark(actualWpm, pct);
    setResult({ wpm: actualWpm, pct, trueWpm });
    setPhase("result");
  }

  if (phase === "intro") {
    return (
      <div className="panel">
        <div className="panel-row">
          <strong>📊 WPM benchmark</strong>
          <button onClick={onClose}>✕</button>
        </div>
        <p className="meta" style={{ marginTop: 8, lineHeight: 1.5 }}>
          You'll read a short standard passage ({words.length} words) at your chosen speed,
          then answer 4 comprehension questions. We log your <strong>true WPM</strong> (raw
          WPM × comprehension %) so you can track improvement over time.
        </p>
        <div className="row" style={{ marginTop: 12, gap: 12 }}>
          <span className="meta">Target WPM</span>
          <input type="range" min={150} max={900} step={25} value={wpm}
            onChange={(e) => setWpm(Number(e.target.value))} />
          <span className="meta">{wpm}</span>
        </div>
        <button className="primary" onClick={start} style={{ marginTop: 14 }}>Start →</button>
      </div>
    );
  }

  if (phase === "reading") {
    const parts = words[index] ? getORP(words[index]!) : { before: "", orp: "", after: "" };
    return (
      <div className="panel">
        <div className="panel-row">
          <strong>📊 Benchmark · reading at {wpm} WPM</strong>
          <span className="meta">Word {index + 1} / {words.length}</span>
        </div>
        <div className="reader" style={{ marginTop: 12 }}>
          <div className="word anchored" style={{ fontSize: 56 }}>
            <div className="half left"><span>{parts.before}</span></div>
            <span className="orp anchor">{parts.orp}</span>
            <div className="half right"><span>{parts.after}</span></div>
          </div>
          <div className="progress"><div className="progress-fill" style={{ width: `${(index / Math.max(1, words.length - 1)) * 100}%` }} /></div>
        </div>
      </div>
    );
  }

  if (phase === "quiz") {
    const allAnswered = picks.every((p) => p !== null);
    return (
      <div className="quiz">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <strong>📊 Benchmark quiz</strong>
          <button onClick={onClose}>✕</button>
        </div>
        {quiz.map((q, qi) => (
          <div key={qi} className="panel" style={{ marginTop: 10 }}>
            <div className="meta" style={{ marginBottom: 6 }}>Q{qi + 1} of {quiz.length}</div>
            <div style={{ lineHeight: 1.5, marginBottom: 10 }}>
              {q.before} <span className="cloze-blank">____</span> {q.after}
            </div>
            <div className="quiz-options">
              {q.options.map((opt) => (
                <button key={opt}
                  className={picks[qi] === opt ? "quiz-opt picked" : "quiz-opt"}
                  onClick={() => setPicks((prev) => prev.map((p, i) => (i === qi ? opt : p)))}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button className="primary" disabled={!allAnswered || submitted} onClick={submit} style={{ marginTop: 12 }}>
          Submit benchmark →
        </button>
      </div>
    );
  }

  // result
  return (
    <div className="panel" style={{ textAlign: "center" }}>
      <div className="meta">Benchmark complete</div>
      <div className="stat-value" style={{ fontSize: "2.4rem" }}>{result?.trueWpm} <span style={{ fontSize: "1rem", color: "var(--text-muted)" }}>true WPM</span></div>
      <div className="meta" style={{ marginTop: 6 }}>
        {result?.wpm} raw WPM · {result?.pct}% comprehension
      </div>
      <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 14 }}>
        <button className="primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
