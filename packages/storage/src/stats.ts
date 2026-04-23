import { getDB, type StatsRow } from "./db.js";

const EMPTY: StatsRow = {
  id: "global",
  totalWordsRead: 0,
  totalSessions: 0,
  wpmHistory: [],
  lastSessionAt: 0,
};

export async function getStats(): Promise<StatsRow> {
  const db = await getDB();
  return (await db.get("stats", "global")) ?? EMPTY;
}

export async function recordWords(words: number, wpm: number): Promise<void> {
  if (words <= 0) return;
  const db = await getDB();
  const cur = (await db.get("stats", "global")) ?? EMPTY;
  const now = Date.now();
  const isNewSession = now - cur.lastSessionAt > 10 * 60 * 1000;
  const updated: StatsRow = {
    id: "global",
    totalWordsRead: cur.totalWordsRead + words,
    totalSessions: cur.totalSessions + (isNewSession ? 1 : 0),
    wpmHistory: [...cur.wpmHistory.slice(-199), { t: now, wpm }],
    lastSessionAt: now,
  };
  await db.put("stats", updated);
}
