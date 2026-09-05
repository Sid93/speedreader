import { useState } from "react";
import { extractPdf, extractText, extractArticle, extractEpub, type ExtractResult } from "@speedreader/extractors";
import { saveDoc } from "@speedreader/storage";
import { tokenize } from "@speedreader/engine";

type Tab = "pdf" | "epub" | "text" | "url";

type QueueItem = { url: string; state: "pending" | "fetching" | "done" | "error"; title?: string; msg?: string };

export function Home({ onLoaded, onQueued }: { onLoaded: (r: ExtractResult) => void; onQueued?: () => void }) {
  const [tab, setTab] = useState<Tab>("pdf");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queueText, setQueueText] = useState("");
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);

  async function runQueue() {
    const urls = [...new Set(
      queueText.split(/\s+/).map((s) => s.trim()).filter((u) => /^https?:\/\//i.test(u)),
    )];
    if (urls.length === 0 || queueRunning) return;
    setQueueRunning(true);
    setQueueItems(urls.map((u) => ({ url: u, state: "pending" })));
    const mark = (i: number, patch: Partial<QueueItem>) =>
      setQueueItems((items) => items.map((q, j) => (j === i ? { ...q, ...patch } : q)));
    for (let i = 0; i < urls.length; i++) {
      mark(i, { state: "fetching" });
      try {
        const r = await extractArticle(urls[i]!);
        if (!r.text.trim()) throw new Error("No text extracted");
        await saveDoc({
          title: r.title,
          text: r.text,
          source: r.source,
          wordCount: tokenize(r.text).length,
          images: r.images,
          links: r.links,
          asides: r.asides,
        });
        mark(i, { state: "done", title: r.title });
      } catch (e) {
        mark(i, { state: "error", msg: e instanceof Error ? e.message : String(e) });
      }
      // Space out requests — r.jina.ai rate-limits anonymous callers.
      if (i < urls.length - 1) await new Promise((res) => setTimeout(res, 1500));
    }
    setQueueRunning(false);
  }

  async function run(fn: () => Promise<ExtractResult>) {
    setErr(null);
    setLoading(true);
    try {
      const result = await fn();
      if (!result.text.trim()) throw new Error("No text extracted.");
      onLoaded(result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="tabs">
        <button className={tab === "pdf" ? "tab active" : "tab"} onClick={() => setTab("pdf")}>📄 PDF</button>
        <button className={tab === "epub" ? "tab active" : "tab"} onClick={() => setTab("epub")}>📚 EPUB</button>
        <button className={tab === "text" ? "tab active" : "tab"} onClick={() => setTab("text")}>📝 Paste</button>
        <button className={tab === "url" ? "tab active" : "tab"} onClick={() => setTab("url")}>🔗 URL</button>
      </div>

      <div className="tab-panel">
        {tab === "pdf" && (
          <label className="drop">
            <input
              type="file"
              accept=".pdf"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) run(() => extractPdf(f));
              }}
            />
            <div className="drop-icon">📄</div>
            <div>Click to choose a PDF</div>
            <div className="meta">or drag and drop anywhere on this box</div>
          </label>
        )}

        {tab === "epub" && (
          <label className="drop">
            <input
              type="file"
              accept=".epub"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) run(() => extractEpub(f));
              }}
            />
            <div className="drop-icon">📚</div>
            <div>Click to choose an EPUB</div>
            <div className="meta">All chapters are concatenated into one continuous read</div>
          </label>
        )}

        {tab === "text" && (
          <div>
            <textarea
              placeholder="Paste any text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
            />
            <button
              className="primary"
              disabled={!text.trim() || loading}
              onClick={() => run(() => extractText(text))}
              style={{ marginTop: 12 }}
            >
              Read this text →
            </button>
          </div>
        )}

        {tab === "url" && (
          <div>
            <input
              type="url"
              placeholder="https://example.com/article"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="primary"
              disabled={!url.trim() || loading}
              onClick={() => run(() => extractArticle(url))}
              style={{ marginTop: 12 }}
            >
              Fetch & read →
            </button>
            <p className="meta" style={{ marginTop: 10 }}>
              Article text is extracted via r.jina.ai (no signup).
            </p>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <strong>📥 Queue several articles</strong>
              <textarea
                placeholder={"Paste article URLs, one per line...\nhttps://example.com/post-1\nhttps://example.com/post-2"}
                value={queueText}
                onChange={(e) => setQueueText(e.target.value)}
                rows={4}
                style={{ marginTop: 8 }}
              />
              <button
                className="primary"
                disabled={queueRunning || !queueText.trim()}
                onClick={runQueue}
                style={{ marginTop: 10 }}
              >
                {queueRunning ? "⏳ Fetching..." : "Add all to queue →"}
              </button>
              {queueItems.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {queueItems.map((q) => (
                    <div key={q.url} className="meta" style={{ marginTop: 4 }}>
                      {q.state === "pending" && "◻️"}
                      {q.state === "fetching" && "⏳"}
                      {q.state === "done" && "✅"}
                      {q.state === "error" && "❌"}{" "}
                      {q.state === "done" ? q.title : q.url}
                      {q.state === "error" && ` — ${q.msg}`}
                    </div>
                  ))}
                  {!queueRunning && queueItems.some((q) => q.state === "done") && (
                    <button onClick={() => onQueued?.()} style={{ marginTop: 10 }}>
                      View queue in Library →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {loading && <p className="meta" style={{ marginTop: 16 }}>⏳ Extracting...</p>}
      {err && <p style={{ marginTop: 16, color: "var(--red)" }}>❌ {err}</p>}
    </div>
  );
}
