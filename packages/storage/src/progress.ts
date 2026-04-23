import { getDB, type Progress } from "./db.js";

export async function saveProgress(docId: string, currentIndex: number): Promise<void> {
  const db = await getDB();
  await db.put("progress", { docId, currentIndex, updatedAt: Date.now() });
}

export async function getProgress(docId: string): Promise<Progress | undefined> {
  const db = await getDB();
  return db.get("progress", docId);
}

export async function clearProgress(docId: string): Promise<void> {
  const db = await getDB();
  await db.delete("progress", docId);
}
