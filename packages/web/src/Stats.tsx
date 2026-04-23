import { useEffect, useState } from "react";
import { getStats, calculateStreak, setDailyGoal, type StatsRow } from "@speedreader/storage";
import { Benchmark } from "./Benchmark.js";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function Stats() {
  const [stats, setStats] = useState<StatsRow | null>(null);
  const [showBench, setShowBench] = useState(false);
  useEffect(() => { getStats().then(setStats); }, [showBench]);
  if (!stats) return <p className="meta">Loading...</p>;

  if (showBench) return <Benchmark onClose={() => setShowBench(false)} />;

  const baselineWpm = 250;
  const avgWpm =
    stats.wpmHistory.length > 0
      ? Math.round(stats.wpmHistory.reduce((a, b) => a + b.wpm, 0) / stats.wpmHistory.length)
      : 0;
  const minutesAtBaseline = stats.totalWordsRead / baselineWpm;
  const minutesAtAvg = avgWpm > 0 ? stats.totalWordsRead / avgWpm : 0;
  const savedMin = Math.max(0, minutesAtBaseline - minutesAtAvg);

  const goal = stats.dailyGoal ?? 2000;
  const todayWords = stats.dailyWords?.[today()] ?? 0;
  const todayPct = goal > 0 ? Math.min(100, Math.round((todayWords / goal) * 100)) : 0;
  const streak = calculateStreak(stats);

  async function updateGoal(next: number) {
    await setDailyGoal(next);
    setStats(await getStats());
  }

  return (
    <div>
      <div className="goal-card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="meta">Today · {streak > 0 ? `🔥 ${streak} day streak` : "Start a streak"}</div>
            <div className="stat-value" style={{ fontSize: "2rem" }}>
              {todayWords.toLocaleString()} <span className="meta" style={{ fontSize: "1rem", fontWeight: 400 }}>/ {goal.toLocaleString()}</span>
            </div>
          </div>
          <label className="row">
            <span className="meta">Goal</span>
            <input
              type="number"
              min={100}
              step={100}
              value={goal}
              onChange={(e) => updateGoal(Number(e.target.value))}
              style={{ width: 90, padding: 6 }}
            />
          </label>
        </div>
        <div className="progress" style={{ marginTop: 12, height: 8 }}>
          <div className="progress-fill" style={{ width: `${todayPct}%` }} />
        </div>
      </div>

      <div className="stats-grid" style={{ marginTop: 16 }}>
        <StatCard label="Total words read" value={stats.totalWordsRead.toLocaleString()} />
        <StatCard label="Sessions" value={stats.totalSessions.toLocaleString()} />
        <StatCard label="Avg WPM" value={avgWpm ? `${avgWpm}` : "—"} />
        <StatCard
          label="Time saved vs 250 WPM"
          value={savedMin > 60 ? `${(savedMin / 60).toFixed(1)} h` : `${Math.round(savedMin)} min`}
        />
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-row">
          <div>
            <strong>📊 WPM benchmark</strong>
            <div className="meta">Measure your true reading speed with a standard passage + quiz.</div>
          </div>
          <button className="primary" onClick={() => setShowBench(true)}>Run test</button>
        </div>
        {(stats.benchmarkHistory?.length ?? 0) > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="meta" style={{ marginBottom: 6 }}>History</div>
            <div className="bench-list">
              {stats.benchmarkHistory!.slice().reverse().slice(0, 8).map((b, i) => (
                <div key={i} className="bench-row">
                  <span className="meta">{new Date(b.t).toLocaleDateString()}</span>
                  <span>{b.trueWpm} <span className="meta">true</span></span>
                  <span className="meta">{b.wpm} raw · {b.comprehensionPct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <div className="meta">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
