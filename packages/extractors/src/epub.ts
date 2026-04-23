import type { ExtractResult } from "./index.js";

// epub.js has no type declarations bundled; treat as any.
async function loadEpubJs() {
  const mod = await import("epubjs");
  return (mod.default ?? mod) as any;
}

export async function extractEpub(file: File): Promise<ExtractResult> {
  const ePub = await loadEpubJs();
  const buf = await file.arrayBuffer();
  const book = ePub(buf);
  await book.ready;

  const meta = await book.loaded.metadata;
  const spine = await book.loaded.spine;

  let fullText = "";
  const parser = new DOMParser();
  for (const item of spine.items as any[]) {
    try {
      const doc = await book.load(item.href);
      // doc is a Document object
      const text = (doc as Document).body?.innerText ?? "";
      fullText += text + "\n\n";
    } catch {
      // Some items may be nav/toc; skip silently.
    }
  }

  return {
    title: meta?.title ?? file.name.replace(/\.epub$/i, ""),
    text: fullText.replace(/\s+\n/g, "\n").trim(),
    source: "epub",
    meta: { author: meta?.creator, chapters: spine.items.length },
  };
}
