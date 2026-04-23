import { useEffect, useState } from "react";
import { listDocs, deleteDoc, getProgress, type LibraryDoc } from "@speedreader/storage";

export function Library({ onOpen }: { onOpen: (doc: LibraryDoc) => void }) {
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [progMap, setProgMap] = useState<Record<string, number>>({});

  async function refresh() {
    const all = await listDocs();
    setDocs(all);
    const entries = await Promise.all(
      all.map(async (d) => [d.id, (await getProgress(d.id))?.currentIndex ?? 0] as const),
    );
    setProgMap(Object.fromEntries(entries));
  }

  useEffect(() => { refresh(); }, []);

  async function remove(id: string) {
    await deleteDoc(id);
    refresh();
  }

  if (docs.length === 0) {
    return <p className="meta">Your library is empty. Read something to add it here.</p>;
  }

  return (
    <div className="library">
      {docs.map((d) => {
        const idx = progMap[d.id] ?? 0;
        const pct = d.wordCount > 0 ? Math.round((idx / (d.wordCount - 1)) * 100) : 0;
        return (
          <div className="lib-card" key={d.id}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{d.title}</div>
              <div className="meta">
                {d.source === "pdf" ? "📄" : d.source === "article" ? "🔗" : "📝"}{" "}
                {d.wordCount.toLocaleString()} words · {pct}% read ·{" "}
                {new Date(d.lastReadAt).toLocaleDateString()}
              </div>
              <div className="progress" style={{ marginTop: 8 }}>
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <button className="primary" onClick={() => onOpen(d)}>
              {pct > 0 && pct < 100 ? "Resume" : "Read"}
            </button>
            <button onClick={() => remove(d.id)} title="Delete">🗑</button>
          </div>
        );
      })}
    </div>
  );
}
