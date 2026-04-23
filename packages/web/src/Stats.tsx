import { useEffect, useState } from "react";
import { getStats, type StatsRow } from "@speedreader/storage";

export function Stats() {
  const [stats, setStats] = useState<StatsRow | null>(null);
  useEffect(() => { getStats().then(setStats); }, []);
  if (!stats) return <p className="meta">Loading...</p>;

  const baselineWpm = 250;
  const minutesAtBaseline = stats.totalWordsRead / baselineWpm;
  const avgWpm =
    stats.wpmHistory.length > 0
      ? Math.round(stats.wpmHistory.reduce((a, b) => a + b.wpm, 0) / stats.wpmHistory.length)
      : 0;
  const minutesAtAvg = avgWpm > 0 ? stats.totalWordsRead / avgWpm : 0;
  const savedMin = Math.max(0, minutesAtBaseline - minutesAtAvg);

  return (
    <div className="stats-grid">
      <StatCard label="Total words read" value={stats.totalWordsRead.toLocaleString()} />
      <StatCard label="Sessions" value={stats.totalSessions.toLocaleString()} />
      <StatCard label="Avg WPM" value={avgWpm ? `${avgWpm}` : "—"} />
      <StatCard
        label="Time saved vs 250 WPM"
        value={savedMin > 60 ? `${(savedMin / 60).toFixed(1)} h` : `${Math.round(savedMin)} min`}
      />
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
