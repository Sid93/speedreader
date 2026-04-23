import { getDB, type StatsRow } from "./db.js";

const EMPTY: StatsRow = {
  id: "global",
  totalWordsRead: 0,
  totalSessions: 0,
  wpmHistory: [],
  lastSessionAt: 0,
  dailyGoal: 2000,
  dailyWords: {},
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getStats(): Promise<StatsRow> {
  const db = await getDB();
  const cur = (await db.get("stats", "global")) ?? EMPTY;
  return {
    ...EMPTY,
    ...cur,
    dailyGoal: cur.dailyGoal ?? EMPTY.dailyGoal,
    dailyWords: cur.dailyWords ?? {},
  };
}

export async function recordWords(words: number, wpm: number): Promise<void> {
  if (words <= 0) return;
  const db = await getDB();
  const cur = (await db.get("stats", "global")) ?? EMPTY;
  const now = Date.now();
  const isNewSession = now - cur.lastSessionAt > 10 * 60 * 1000;
  const daily = { ...(cur.dailyWords ?? {}) };
  const key = today();
  daily[key] = (daily[key] ?? 0) + words;
  const updated: StatsRow = {
    id: "global",
    totalWordsRead: cur.totalWordsRead + words,
    totalSessions: cur.totalSessions + (isNewSession ? 1 : 0),
    wpmHistory: [...cur.wpmHistory.slice(-199), { t: now, wpm }],
    lastSessionAt: now,
    dailyGoal: cur.dailyGoal ?? EMPTY.dailyGoal,
    dailyWords: daily,
  };
  await db.put("stats", updated);
}

export async function recordBenchmark(wpm: number, comprehensionPct: number): Promise<void> {
  const db = await getDB();
  const cur = (await db.get("stats", "global")) ?? EMPTY;
  const trueWpm = Math.round(wpm * (comprehensionPct / 100));
  const updated: StatsRow = {
    ...EMPTY,
    ...cur,
    benchmarkHistory: [
      ...((cur.benchmarkHistory ?? []).slice(-49)),
      { t: Date.now(), wpm, comprehensionPct, trueWpm },
    ],
  };
  await db.put("stats", updated);
}

export async function setDailyGoal(goal: number): Promise<void> {
  const db = await getDB();
  const cur = (await db.get("stats", "global")) ?? EMPTY;
  await db.put("stats", { ...EMPTY, ...cur, dailyGoal: Math.max(0, Math.round(goal)) });
}

/** Calculate current streak: consecutive days (ending today or yesterday) where goal was met. */
export function calculateStreak(stats: StatsRow): number {
  const goal = stats.dailyGoal ?? 0;
  const daily = stats.dailyWords ?? {};
  if (goal <= 0) return 0;
  let streak = 0;
  const now = new Date();
  // Allow grace for today (still in progress): if today didn't meet goal, start counting from yesterday.
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if ((daily[todayKey] ?? 0) < goal) d.setDate(d.getDate() - 1);
  while (true) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if ((daily[key] ?? 0) >= goal) streak++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
