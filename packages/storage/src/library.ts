import { getDB, type LibraryDoc } from "./db.js";

async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text.slice(0, 4096));
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function saveDoc(
  input: Omit<LibraryDoc, "id" | "addedAt" | "lastReadAt" | "wordCount"> & {
    wordCount: number;
  },
): Promise<LibraryDoc> {
  const db = await getDB();
  const id = await hashText(input.title + "|" + input.text);
  const now = Date.now();
  const existing = await db.get("library", id);
  const doc: LibraryDoc = {
    id,
    title: input.title,
    text: input.text,
    wordCount: input.wordCount,
    source: input.source,
    addedAt: existing?.addedAt ?? now,
    lastReadAt: now,
  };
  await db.put("library", doc);
  return doc;
}

export async function listDocs(): Promise<LibraryDoc[]> {
  const db = await getDB();
  const all = await db.getAll("library");
  return all.sort((a, b) => b.lastReadAt - a.lastReadAt);
}

export async function getDoc(id: string): Promise<LibraryDoc | undefined> {
  const db = await getDB();
  return db.get("library", id);
}

export async function deleteDoc(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("library", id);
  await db.delete("progress", id);
}
