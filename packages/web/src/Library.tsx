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

  const pctOf = (d: LibraryDoc) => {
    const idx = progMap[d.id] ?? 0;
    return d.wordCount > 1 ? Math.round((idx / (d.wordCount - 1)) * 100) : 0;
  };
  const started = (d: LibraryDoc) => (progMap[d.id] ?? 0) > 0;

  // Queue = added but never started, oldest first (read in the order queued).
  const upNext = docs.filter((d) => !started(d)).sort((a, b) => a.addedAt - b.addedAt);
  const inProgress = docs.filter((d) => started(d) && pctOf(d) < 100);
  const finished = docs.filter((d) => started(d) && pctOf(d) >= 100);

  const card = (d: LibraryDoc, cta: string) => {
    const pct = pctOf(d);
    return (
      <div className="lib-card" key={d.id}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>{d.title}</div>
          <div className="meta">
            {d.source === "pdf" ? "📄" : d.source === "epub" ? "📚" : d.source === "article" ? "🔗" : "📝"}{" "}
            {d.wordCount.toLocaleString()} words · {pct}% read ·{" "}
            {new Date(d.lastReadAt).toLocaleDateString()}
          </div>
          <div className="progress" style={{ marginTop: 8 }}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button className="primary" onClick={() => onOpen(d)}>{cta}</button>
        <button onClick={() => remove(d.id)} title="Delete">🗑</button>
      </div>
    );
  };

  const section = (title: string, items: LibraryDoc[], cta: (d: LibraryDoc, i: number) => string) =>
    items.length > 0 && (
      <div style={{ marginBottom: 20 }}>
        <div className="meta" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 8px" }}>
          {title} ({items.length})
        </div>
        {items.map((d, i) => card(d, cta(d, i)))}
      </div>
    );

  return (
    <div className="library">
      {section("📥 Up next", upNext, (_d, i) => (i === 0 ? "▶ Read next" : "Read"))}
      {section("📖 In progress", inProgress, () => "Resume")}
      {section("✅ Finished", finished, () => "Read again")}
    </div>
  );
}
