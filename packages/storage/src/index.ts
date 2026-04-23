export type { LibraryDoc, Progress, StatsRow } from "./db.js";
export { saveDoc, listDocs, getDoc, deleteDoc } from "./library.js";
export { saveProgress, getProgress, clearProgress } from "./progress.js";
export { getStats, recordWords, setDailyGoal, calculateStreak, recordBenchmark } from "./stats.js";
