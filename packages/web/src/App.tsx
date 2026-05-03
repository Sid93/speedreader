import { useEffect, useState } from "react";
import type { ExtractResult } from "@speedreader/extractors";
import { saveDoc, listDocs, getProgress, type LibraryDoc } from "@speedreader/storage";
import { tokenize } from "@speedreader/engine";
import { Home } from "./Home.js";
import { Reader } from "./Reader.js";
import { Library } from "./Library.js";
import { Stats } from "./Stats.js";
import { Drills } from "./Drills.js";

type Tab = "home" | "library" | "drills" | "stats";

type Theme = "system" | "light" | "dark";

function applyTheme(t: Theme) {
  const resolved = t === "system"
    ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : t;
  document.documentElement.classList.toggle("theme-light", resolved === "light");
  document.documentElement.classList.toggle("theme-dark",  resolved === "dark");
}

export function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [doc, setDoc] = useState<LibraryDoc | null>(null);
  const [continueDoc, setContinueDoc] = useState<{ doc: LibraryDoc; pct: number } | null>(null);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("sr.theme") as Theme) ?? "system");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("sr.theme", theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function cycleTheme() {
    setTheme((t) => (t === "system" ? "light" : t === "light" ? "dark" : "system"));
  }
  const themeIcon = theme === "light" ? "☀︎" : theme === "dark" ? "☾" : "✦";

  useEffect(() => {
    if (doc || tab !== "home") return;
    (async () => {
      const docs = await listDocs();
      for (const d of docs) {
        const p = await getProgress(d.id);
        const idx = p?.currentIndex ?? 0;
        const pct = d.wordCount > 1 ? Math.round((idx / (d.wordCount - 1)) * 100) : 0;
        if (pct > 0 && pct < 100) {
          setContinueDoc({ doc: d, pct });
          return;
        }
      }
      setContinueDoc(null);
    })();
  }, [doc, tab]);

  async function handleExtracted(r: ExtractResult) {
    const wordCount = tokenize(r.text).length;
    const saved = await saveDoc({
      title: r.title,
      text: r.text,
      source: r.source,
      wordCount,
      images: r.images,
    });
    setDoc(saved);
  }

  if (doc) {
    return <Reader doc={doc} onBack={() => { setDoc(null); setTab("library"); }} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Speed <span>Reader</span></h1>
        <div className="row" style={{ gap: 10 }}>
          <nav className="nav">
            <button className={tab === "home" ? "tab active" : "tab"} onClick={() => setTab("home")}>New</button>
            <button className={tab === "library" ? "tab active" : "tab"} onClick={() => setTab("library")}>Library</button>
            <button className={tab === "drills" ? "tab active" : "tab"} onClick={() => setTab("drills")}>Drills</button>
            <button className={tab === "stats" ? "tab active" : "tab"} onClick={() => setTab("stats")}>Stats</button>
          </nav>
          <button className="theme-toggle" onClick={cycleTheme} title={`Theme: ${theme}`}>{themeIcon}</button>
        </div>
      </header>
      {tab === "home" && (
        <>
          {continueDoc && (
            <button className="continue-card" onClick={() => setDoc(continueDoc.doc)}>
              <div className="continue-label">Continue reading</div>
              <div className="continue-title">{continueDoc.doc.title}</div>
              <div className="continue-meta">
                {continueDoc.pct}% · {continueDoc.doc.wordCount.toLocaleString()} words
              </div>
              <div className="progress" style={{ marginTop: 10 }}>
                <div className="progress-fill" style={{ width: `${continueDoc.pct}%` }} />
              </div>
            </button>
          )}
          <Home onLoaded={handleExtracted} />
        </>
      )}
      {tab === "library" && <Library onOpen={setDoc} />}
      {tab === "drills" && <Drills />}
      {tab === "stats" && <Stats />}
    </div>
  );
}
