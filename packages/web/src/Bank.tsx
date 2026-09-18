import { useEffect, useState } from "react";
import { listClips, deleteClip, getDoc, type Clip, type LibraryDoc } from "@speedreader/storage";

export function Bank({ onOpenDoc }: { onOpenDoc: (d: LibraryDoc) => void }) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    listClips().then(setClips);
  }, []);

  async function remove(id: string) {
    await deleteClip(id);
    setClips((cs) => cs.filter((c) => c.id !== id));
  }

  async function copy(c: Clip) {
    try {
      await navigator.clipboard.writeText(`> ${c.text.replace(/\n/g, "\n> ")}\n— ${c.docTitle}`);
      setCopiedId(c.id);
      setTimeout(() => setCopiedId((x) => (x === c.id ? null : x)), 1800);
    } catch { /* clipboard unavailable */ }
  }

  function exportAll() {
    const byDoc = new Map<string, Clip[]>();
    for (const c of clips) {
      const list = byDoc.get(c.docTitle) ?? [];
      list.push(c);
      byDoc.set(c.docTitle, list);
    }
    const md = ["# Memory bank", ""];
    for (const [title, list] of byDoc) {
      md.push(`## ${title}`, "");
      for (const c of [...list].sort((a, b) => a.wordStart - b.wordStart)) {
        md.push(`> ${c.text.replace(/\n/g, "\n> ")}`, "");
      }
    }
    const blob = new Blob([md.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "memory-bank.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (clips.length === 0) {
    return (
      <div className="panel">
        <strong>🔖 Memory bank is empty</strong>
        <p className="meta" style={{ marginTop: 8 }}>
          While speed reading, press <kbd>B</kbd> (or tap 🔖) to bookmark the passage you're on —
          it opens the article view with that section pre-selected. Click sections to select them,
          then save. Everything you save lands here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <strong>🔖 Memory bank · {clips.length} passage{clips.length > 1 ? "s" : ""}</strong>
        <button onClick={exportAll} title="Download all passages as Markdown">⬇ Export .md</button>
      </div>
      {clips.map((c) => {
        const isLong = c.text.length > 360;
        const isOpen = expanded.has(c.id);
        const shown = isLong && !isOpen ? c.text.slice(0, 360).trimEnd() + "…" : c.text;
        return (
          <div key={c.id} className="panel clip-card">
            <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
              <span className="meta clip-source" title={c.docTitle}>{c.docTitle}</span>
              <span className="meta">{new Date(c.savedAt).toLocaleDateString()}</span>
            </div>
            <blockquote className="clip-text">{shown}</blockquote>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {isLong && (
                <button onClick={() => setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id); else n.add(c.id);
                  return n;
                })}>{isOpen ? "Show less" : "Show all"}</button>
              )}
              <button onClick={() => copy(c)}>{copiedId === c.id ? "✓ Copied" : "⧉ Copy"}</button>
              <button onClick={async () => {
                const d = await getDoc(c.docId);
                if (d) onOpenDoc(d);
              }}>Open source</button>
              <button onClick={() => remove(c.id)} title="Remove from bank">🗑</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
