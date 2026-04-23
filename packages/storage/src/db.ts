import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface LibraryDoc {
  id: string;
  title: string;
  text: string;
  wordCount: number;
  source: "pdf" | "text" | "article";
  addedAt: number;
  lastReadAt: number;
}

export interface Progress {
  docId: string;
  currentIndex: number;
  updatedAt: number;
}

export interface StatsRow {
  id: "global";
  totalWordsRead: number;
  totalSessions: number;
  wpmHistory: { t: number; wpm: number }[];
  lastSessionAt: number;
}

interface SchemaV1 extends DBSchema {
  library: {
    key: string;
    value: LibraryDoc;
    indexes: { "by-lastReadAt": number };
  };
  progress: {
    key: string;
    value: Progress;
  };
  stats: {
    key: "global";
    value: StatsRow;
  };
}

const DB_NAME = "speedreader";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SchemaV1>> | null = null;

export function getDB(): Promise<IDBPDatabase<SchemaV1>> {
  if (!dbPromise) {
    dbPromise = openDB<SchemaV1>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("library")) {
          const store = db.createObjectStore("library", { keyPath: "id" });
          store.createIndex("by-lastReadAt", "lastReadAt");
        }
        if (!db.objectStoreNames.contains("progress")) {
          db.createObjectStore("progress", { keyPath: "docId" });
        }
        if (!db.objectStoreNames.contains("stats")) {
          db.createObjectStore("stats", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}
