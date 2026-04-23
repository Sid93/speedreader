import { useState } from "react";
import { extractPdf, extractText, extractArticle, type ExtractResult } from "@speedreader/extractors";

type Tab = "pdf" | "text" | "url";

export function Home({ onLoaded }: { onLoaded: (r: ExtractResult) => void }) {
  const [tab, setTab] = useState<Tab>("pdf");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
          </div>
        )}
      </div>

      {loading && <p className="meta" style={{ marginTop: 16 }}>⏳ Extracting...</p>}
      {err && <p style={{ marginTop: 16, color: "var(--red)" }}>❌ {err}</p>}
    </div>
  );
}
