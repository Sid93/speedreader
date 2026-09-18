import { useEffect, useMemo, useRef, useState } from "react";
import { IMG_TOKEN_RE } from "@speedreader/extractors";
import type { LibraryDoc } from "@speedreader/storage";

interface Para {
  /** Paragraph text with image markers removed. */
  text: string;
  /** Image ids whose markers sat in this paragraph. */
  imageIds: number[];
  /** Word range [start, end) in the doc's token stream. */
  wordStart: number;
  wordEnd: number;
  isHeading: boolean;
}

/** Split the doc into renderable paragraphs with word offsets that line up
 *  with the RSVP token stream (both split on whitespace). */
function buildParas(text: string): Para[] {
  const paras: Para[] = [];
  let wordIdx = 0;
  for (const raw of text.split(/\n{2,}/)) {
    const ws = raw.trim().split(/\s+/).filter(Boolean);
    if (ws.length === 0) continue;
    const imageIds: number[] = [];
    const keptWords: string[] = [];
    for (const w of ws) {
      const m = w.match(IMG_TOKEN_RE);
      if (m) imageIds.push(Number(m[1]));
      else keptWords.push(w);
    }
    const lastWord = keptWords[keptWords.length - 1] ?? "";
    const isHeading =
      keptWords.length > 0 &&
      keptWords.length <= 8 &&
      !/[.!?,;:]$/.test(lastWord) &&
      /[A-Za-z]/.test(raw) &&
      imageIds.length === 0;
    paras.push({
      text: keptWords.join(" "),
      imageIds,
      wordStart: wordIdx,
      wordEnd: wordIdx + ws.length,
      isHeading,
    });
    wordIdx += ws.length;
  }
  return paras;
}

export function ArticleView({
  doc,
  currentIndex,
  bookmarkAt,
  fontFamily,
  onSave,
  onReadFrom,
}: {
  doc: LibraryDoc;
  currentIndex: number;
  /** Word index to auto-select + scroll to (set when arriving via 🔖). */
  bookmarkAt: number | null;
  fontFamily: string;
  onSave: (clip: { text: string; wordStart: number; wordEnd: number }) => void;
  onReadFrom: (wordIndex: number) => void;
}) {
  const paras = useMemo(() => buildParas(doc.text), [doc.text]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [savedFlash, setSavedFlash] = useState(false);
  const scrolledRef = useRef(false);

  const anchorAt = bookmarkAt ?? currentIndex;
  const anchorPara = useMemo(() => {
    for (let i = 0; i < paras.length; i++) {
      if (anchorAt < paras[i]!.wordEnd) return i;
    }
    return paras.length - 1;
  }, [paras, anchorAt]);

  // Arriving from the RSVP bookmark: pre-select the paragraph being read and
  // bring it into view, so one click on Save banks it.
  useEffect(() => {
    if (scrolledRef.current) return;
    scrolledRef.current = true;
    if (bookmarkAt !== null) setSelected(new Set([anchorPara]));
    const el = document.getElementById(`para-${anchorPara}`);
    if (el) setTimeout(() => el.scrollIntoView({ block: "center" }), 60);
  }, [anchorPara, bookmarkAt]);

  const toggleSelect = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  function saveSelection() {
    const idxs = [...selected].sort((a, b) => a - b);
    if (idxs.length === 0) return;
    const text = idxs.map((i) => paras[i]!.text).join("\n\n");
    onSave({
      text,
      wordStart: paras[idxs[0]!]!.wordStart,
      wordEnd: paras[idxs[idxs.length - 1]!]!.wordEnd,
    });
    setSelected(new Set());
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2200);
  }

  return (
    <div className="article-view">
      <div className="article-body" style={{ fontFamily }}>
        {paras.map((p, i) => {
          const isCurrent = i === anchorPara;
          const isSel = selected.has(i);
          const cls = [
            "article-para",
            p.isHeading && "article-heading",
            isCurrent && "article-current",
            isSel && "article-selected",
          ].filter(Boolean).join(" ");
          return (
            <div key={i} id={`para-${i}`} className={cls} onClick={() => toggleSelect(i)}
                 role="button" tabIndex={0}
                 onKeyDown={(e) => { if (e.key === "Enter") toggleSelect(i); }}>
              {p.isHeading ? <h3>{p.text}</h3> : p.text && <p>{p.text}</p>}
              {p.imageIds.map((id) => {
                const img = doc.images?.find((x) => x.id === id);
                if (!img) return null;
                return (
                  <figure key={id} className="article-figure">
                    <img src={img.src} alt={img.alt ?? ""} loading="lazy" />
                    {img.alt && <figcaption className="meta">{img.alt}</figcaption>}
                  </figure>
                );
              })}
            </div>
          );
        })}
      </div>

      {(selected.size > 0 || savedFlash) && (
        <div className="clip-bar">
          {savedFlash && selected.size === 0 ? (
            <span className="clip-saved">✓ Saved to Memory bank</span>
          ) : (
            <>
              <span className="meta">{selected.size} section{selected.size > 1 ? "s" : ""} selected</span>
              <button className="primary" onClick={saveSelection}>🔖 Save to Memory bank</button>
              <button onClick={() => onReadFrom(paras[Math.min(...selected)]!.wordStart)}>⚡ Read from here</button>
              <button onClick={() => setSelected(new Set())}>✕</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
