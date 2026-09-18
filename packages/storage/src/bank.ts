import { getDB, type Clip } from "./db.js";

export async function saveClip(
  input: Omit<Clip, "id" | "savedAt">,
): Promise<Clip> {
  const db = await getDB();
  const clip: Clip = {
    ...input,
    id: `${input.docId}:${input.wordStart}-${input.wordEnd}`,
    savedAt: Date.now(),
  };
  await db.put("bank", clip);
  return clip;
}

export async function listClips(): Promise<Clip[]> {
  const db = await getDB();
  const all = await db.getAll("bank");
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteClip(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("bank", id);
}
