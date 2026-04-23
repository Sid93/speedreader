import { useMemo, useState } from "react";
import { buildQuiz, type QuizQuestion } from "@speedreader/engine";

export function Quiz({ text, onClose, onScore }: { text: string; onClose: () => void; onScore?: (correct: number, total: number) => void }) {
  const [seed, setSeed] = useState(Date.now() & 0xffff);
  const questions = useMemo<QuizQuestion[]>(() => buildQuiz(text, { count: 3, seed }), [text, seed]);
  const [picks, setPicks] = useState<(string | null)[]>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="panel">
        <div className="meta">Not enough text to build a quiz.</div>
        <button onClick={onClose} style={{ marginTop: 12 }}>Close</button>
      </div>
    );
  }

  const correct = questions.filter((q, i) => picks[i]?.toLowerCase() === q.answer.toLowerCase()).length;
  const allAnswered = picks.every((p) => p !== null);

  return (
    <div className="quiz">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <strong>🧠 Quick comprehension quiz</strong>
        <button onClick={onClose}>✕ Close</button>
      </div>

      {questions.map((q, qi) => (
        <div key={qi} className="panel" style={{ marginTop: 12 }}>
          <div className="meta" style={{ marginBottom: 8 }}>Question {qi + 1} of {questions.length}</div>
          <div style={{ fontSize: "1.05rem", lineHeight: 1.5, marginBottom: 12 }}>
            {q.before}{" "}
            <span className="cloze-blank">{submitted ? q.answer : "____"}</span>{" "}
            {q.after}
          </div>
          <div className="quiz-options">
            {q.options.map((opt) => {
              const picked = picks[qi] === opt;
              const isAnswer = opt.toLowerCase() === q.answer.toLowerCase();
              let cls = "quiz-opt";
              if (submitted) {
                if (isAnswer) cls += " correct";
                else if (picked) cls += " wrong";
              } else if (picked) cls += " picked";
              return (
                <button
                  key={opt}
                  className={cls}
                  disabled={submitted}
                  onClick={() => setPicks((prev) => prev.map((p, i) => (i === qi ? opt : p)))}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {!submitted ? (
        <button
          className="primary"
          disabled={!allAnswered}
          onClick={() => { setSubmitted(true); onScore?.(correct, questions.length); }}
          style={{ marginTop: 14 }}
        >
          Submit →
        </button>
      ) : (
        <div className="quiz-result">
          <div className="stat-value" style={{ fontSize: "1.5rem" }}>
            {correct} / {questions.length}
          </div>
          <div className="meta" style={{ marginBottom: 10 }}>
            {correct === questions.length ? "Perfect recall!" : correct >= questions.length / 2 ? "Nice, mostly there." : "Could be worth another pass."}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button onClick={() => { setSeed(s => s + 1); setPicks(questions.map(() => null)); setSubmitted(false); }}>
              New questions
            </button>
            <button className="primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
