import { useState } from "react";
import type { ExtractResult } from "@speedreader/extractors";
import { saveDoc, type LibraryDoc } from "@speedreader/storage";
import { tokenize } from "@speedreader/engine";
import { Home } from "./Home.js";
import { Reader } from "./Reader.js";
import { Library } from "./Library.js";
import { Stats } from "./Stats.js";

type Tab = "home" | "library" | "stats";

export function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [doc, setDoc] = useState<LibraryDoc | null>(null);

  async function handleExtracted(r: ExtractResult) {
    const wordCount = tokenize(r.text).length;
    const saved = await saveDoc({
      title: r.title,
      text: r.text,
      source: r.source,
      wordCount,
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
        <nav className="nav">
          <button className={tab === "home" ? "tab active" : "tab"} onClick={() => setTab("home")}>📥 New</button>
          <button className={tab === "library" ? "tab active" : "tab"} onClick={() => setTab("library")}>📚 Library</button>
          <button className={tab === "stats" ? "tab active" : "tab"} onClick={() => setTab("stats")}>📊 Stats</button>
        </nav>
      </header>
      {tab === "home" && <Home onLoaded={handleExtracted} />}
      {tab === "library" && <Library onOpen={setDoc} />}
      {tab === "stats" && <Stats />}
    </div>
  );
}
