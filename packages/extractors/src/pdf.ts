import type { ExtractResult, ExtractedImage } from "./index.js";
import { imageMarker } from "./index.js";

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as string)
  ).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

/**
 * Position-aware text reflow: insert spaces on horizontal gaps, newlines on
 * y-jumps, join words split by hyphenated line breaks.
 */
function pageItemsToText(items: any[]): string {
  if (!items.length) return "";
  let out = "";
  let lastX = -Infinity;
  let lastY = Infinity;
  let lastWidth = 0;
  let lastHeight = 0;

  for (const it of items) {
    if (typeof it.str !== "string") continue;
    const tx = it.transform?.[4] ?? 0;
    const ty = it.transform?.[5] ?? 0;
    const w = it.width ?? 0;
    const h = it.height ?? lastHeight ?? 12;

    const isNewLine =
      it.hasEOL || (lastY !== Infinity && Math.abs(ty - lastY) > Math.max(h, 4) * 0.6);
    const horizontalGap = tx - (lastX + lastWidth);

    if (isNewLine) {
      if (out.endsWith("-") && it.str && /^[a-z]/.test(it.str)) {
        out = out.slice(0, -1);
      } else {
        const lineGap = lastY - ty;
        if (lineGap > h * 1.6) out += "\n\n";
        else out += " ";
      }
    } else if (horizontalGap > h * 0.25 && out && !out.endsWith(" ") && !out.endsWith("\n")) {
      out += " ";
    }
    out += it.str;
    lastX = tx;
    lastY = ty;
    lastWidth = w;
    lastHeight = h;
  }
  return out;
}

/** Render a whole PDF page to a JPEG thumbnail data URL.
 *  Used as a fallback for chart-heavy pages where images are vector paths
 *  not exposed as XObjects. */
async function renderPageThumb(page: any, maxWidth: number): Promise<{ src: string; w: number; h: number } | null> {
  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(maxWidth / baseViewport.width, 2);
    const viewport = page.getViewport({ scale });
    const w = Math.floor(viewport.width);
    const h = Math.floor(viewport.height);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Fill white so transparent backgrounds in PDFs come out readable.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, w, h);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { src: canvas.toDataURL("image/jpeg", 0.78), w, h };
  } catch {
    return null;
  }
}

/** Read an XObject image from a page and return a JPEG data URL, or null. */
async function imgObjToDataUrl(page: any, objId: string): Promise<{ src: string; w: number; h: number } | null> {
  // pdf.js stores rendered image objects on the page's `objs` registry. Some
  // are backed by ImageBitmap, others by raw RGBA pixels. We render either
  // through a canvas and serialize as JPEG.
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val: any) => {
      if (resolved) return;
      resolved = true;
      resolve(val);
    };

    const tryEncode = (img: any) => {
      try {
        if (!img) return finish(null);
        const w = img.width ?? img.bitmap?.width ?? 0;
        const h = img.height ?? img.bitmap?.height ?? 0;
        if (!w || !h) return finish(null);
        // Skip tiny decorative images (icons, bullets).
        if (w < 80 || h < 80) return finish(null);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        if (img.bitmap) {
          ctx.drawImage(img.bitmap, 0, 0);
        } else if (img.data) {
          // RGBA byte array
          const id = ctx.createImageData(w, h);
          const len = Math.min(id.data.length, img.data.length);
          for (let i = 0; i < len; i++) id.data[i] = img.data[i]!;
          ctx.putImageData(id, 0, 0);
        } else {
          return finish(null);
        }
        const maxDim = 900;
        let outW = w, outH = h;
        if (w > maxDim || h > maxDim) {
          const k = maxDim / Math.max(w, h);
          outW = Math.round(w * k);
          outH = Math.round(h * k);
          const out = document.createElement("canvas");
          out.width = outW;
          out.height = outH;
          out.getContext("2d")!.drawImage(canvas, 0, 0, outW, outH);
          finish({ src: out.toDataURL("image/jpeg", 0.78), w: outW, h: outH });
        } else {
          finish({ src: canvas.toDataURL("image/jpeg", 0.78), w, h });
        }
      } catch {
        finish(null);
      }
    };

    // Some objects resolve sync, some async via callback.
    try {
      const cached = page.objs.get(objId, (img: any) => tryEncode(img));
      if (cached !== undefined) tryEncode(cached);
    } catch {
      finish(null);
    }
    // Fallback timeout
    setTimeout(() => finish(null), 1500);
  });
}

async function extractPageImages(pdfjs: any, page: any): Promise<{ src: string; w: number; h: number }[]> {
  // Render the page invisibly so pdf.js populates page.objs with image data.
  const viewport = page.getViewport({ scale: 1 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  try {
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch {
    return [];
  }
  let opList: any;
  try {
    opList = await page.getOperatorList();
  } catch {
    return [];
  }
  const OPS = pdfjs.OPS;
  const ids = new Set<string>();
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const objId = opList.argsArray[i]?.[0];
      if (typeof objId === "string") ids.add(objId);
    }
  }
  const imgs: { src: string; w: number; h: number }[] = [];
  for (const id of ids) {
    const dataUrl = await imgObjToDataUrl(page, id);
    if (dataUrl) imgs.push(dataUrl);
  }
  return imgs;
}

/** Collect embedded raster images from a page WITHOUT rendering it.
 *  getOperatorList alone makes pdf.js decode image XObjects into page.objs,
 *  so books get their figures at a fraction of the cost of a full render
 *  (measured ~4s across a 482-page book vs. minutes with per-page render). */
async function scanEmbeddedImages(pdfjs: any, page: any): Promise<{ src: string; w: number; h: number }[]> {
  let opList: any;
  try {
    opList = await page.getOperatorList();
  } catch {
    return [];
  }
  const OPS = pdfjs.OPS;
  const ids = new Set<string>();
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const objId = opList.argsArray[i]?.[0];
      if (typeof objId === "string") ids.add(objId);
    }
  }
  const imgs: { src: string; w: number; h: number }[] = [];
  for (const id of ids) {
    // More than 2 images on a book page is almost always decoration.
    if (imgs.length >= 2) break;
    const dataUrl = await imgObjToDataUrl(page, id);
    if (dataUrl) imgs.push(dataUrl);
  }
  return imgs;
}

/** Above this page count, skip per-page image/chart extraction: rendering
 *  every page of an ebook to canvas takes minutes and can crash the tab.
 *  Long documents still get embedded figures via scanEmbeddedImages. */
const IMAGE_EXTRACTION_MAX_PAGES = 40;

/** Safety valve for image-heavy books (photo albums, scanned PDFs). */
const BOOK_IMAGE_CAP = 150;

export async function extractPdf(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractResult> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const lightMode = pdf.numPages > IMAGE_EXTRACTION_MAX_PAGES;

  // Two-pass: capture images into placeholders, filter, then renumber.
  type Cap = { src: string; page: number; w: number; h: number; isPageSnapshot?: boolean };
  const captured: Cap[] = [];
  const pageTexts: string[] = [];
  const pageTextLength: number[] = [];
  const pageRefs: { page: any; rendered: any }[] = []; // keep so we can snapshot later
  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = pageItemsToText(content.items as any[]);
    pageTexts.push(pageText);
    pageTextLength.push(pageText.length);
    if (!lightMode) pageRefs.push({ page, rendered: null });
    if (i > 1) fullText += "\n\n";
    fullText += pageText;

    if (!lightMode) {
      try {
        const pageImages = await extractPageImages(pdfjs, page);
        for (const img of pageImages) {
          captured.push({ src: img.src, page: i, w: img.w, h: img.h });
          fullText += ` ⟦P${captured.length - 1}⟧ `;
        }
      } catch {
        /* skip */
      }
    } else {
      // Books still get their figures — scanEmbeddedImages decodes image
      // XObjects without the per-page canvas render that made big PDFs hang.
      if (captured.length < BOOK_IMAGE_CAP) {
        try {
          const pageImages = await scanEmbeddedImages(pdfjs, page);
          for (const img of pageImages) {
            captured.push({ src: img.src, page: i, w: img.w, h: img.h });
            fullText += ` ⟦P${captured.length - 1}⟧ `;
          }
        } catch {
          /* skip */
        }
      }
      // Free page resources as we go — books would otherwise pile up memory.
      try { page.cleanup(); } catch { /* fine */ }
    }
    onProgress?.(i, pdf.numPages);
  }

  // ── Detect chart-heavy pages and snapshot them ────────────────────────
  // PDF vector charts (e.g. matplotlib SVGs) are drawn with paths, not as
  // images, so the image extractor misses them. Heuristic: compare each
  // page's text length to the document average. Pages with substantially
  // less text are likely chart/diagram pages — render them as a thumbnail
  // so the reader sees something instead of skipping over silent pages.
  const totalText = pageTextLength.reduce((a, b) => a + b, 0);
  const avgText = totalText / Math.max(1, pdf.numPages);
  // Only bother if the doc has multiple pages of substantive text (and skip
  // entirely for books — snapshotting chapter-title pages helps nobody).
  if (!lightMode && pdf.numPages >= 2 && avgText > 200) {
    for (let i = 0; i < pdf.numPages; i++) {
      const len = pageTextLength[i]!;
      // Page is "chart-heavy" if it has < 30% of the average text, OR if it
      // has under 60 chars (basically wordless).
      const isChartHeavy = len < Math.min(avgText * 0.3, 200) || len < 60;
      if (!isChartHeavy) continue;
      // Skip if we already extracted real images from this page.
      const hasRealImage = captured.some((c) => c.page === i + 1);
      if (hasRealImage) continue;
      // Render this page as a thumbnail and inject as an image right at
      // the page boundary in the text stream.
      try {
        const snap = await renderPageThumb(pageRefs[i]!.page, 760);
        if (!snap) continue;
        captured.push({ src: snap.src, page: i + 1, w: snap.w, h: snap.h, isPageSnapshot: true });
        const idx = captured.length - 1;
        // Insert marker right after this page's text, before the next page.
        const pageBreaks: number[] = [];
        let cursor = 0;
        const marker = "\n\n";
        while (true) {
          const at = fullText.indexOf(marker, cursor);
          if (at < 0) break;
          pageBreaks.push(at);
          cursor = at + marker.length;
        }
        if (i < pageBreaks.length) {
          const insertAt = pageBreaks[i]!;
          fullText = fullText.slice(0, insertAt) + ` ⟦P${idx}⟧ ` + fullText.slice(insertAt);
        } else {
          fullText += ` ⟦P${idx}⟧ `;
        }
      } catch {
        /* skip */
      }
    }
  }

  // Filter: drop dupes (letterhead repeats on every page) and images that
  // appear on more than 25% of pages (header/footer/logo). Keep the first
  // occurrence so a single legit chart isn't dropped.
  const srcCount = new Map<string, number>();
  for (const c of captured) srcCount.set(c.src, (srcCount.get(c.src) ?? 0) + 1);
  const repeatThreshold = Math.max(2, Math.ceil(pdf.numPages * 0.25));
  const seenSrc = new Set<string>();
  const drop = new Set<number>();
  for (let i = 0; i < captured.length; i++) {
    const c = captured[i]!;
    // Drop tiny / weird aspect ratios (likely page numbers, dividers).
    if (c.w < 100 || c.h < 60) { drop.add(i); continue; }
    const aspect = c.w / c.h;
    if (aspect > 12 || aspect < 1 / 12) { drop.add(i); continue; }
    // Drop if this src appears on too many pages (chrome).
    if ((srcCount.get(c.src) ?? 0) >= repeatThreshold) { drop.add(i); continue; }
    // Drop dupes (keep first).
    if (seenSrc.has(c.src)) { drop.add(i); continue; }
    seenSrc.add(c.src);
  }

  // Drop runs of 2+ adjacent placeholders (image-heavy footers/headers).
  fullText = fullText.replace(/⟦P\d+⟧(?:\s*⟦P\d+⟧)+/g, (run) => {
    // Mark every placeholder in the run as dropped, keep zero or one.
    const idxs = [...run.matchAll(/⟦P(\d+)⟧/g)].map((m) => Number(m[1]));
    for (const idx of idxs) drop.add(idx);
    return " ";
  });

  // Drop the placeholders flagged.
  for (const idx of drop) fullText = fullText.replace(`⟦P${idx}⟧`, " ");

  // Convert surviving placeholders to real markers + build images list.
  const images: ExtractedImage[] = [];
  fullText = fullText.replace(/⟦P(\d+)⟧/g, (_m, idxStr: string) => {
    const c = captured[Number(idxStr)]!;
    const id = images.length;
    images.push({ id, src: c.src, page: c.page });
    return ` ${imageMarker(id)} `;
  });

  // For book-length PDFs, split into chapters (outline first, heading
  // heuristic as fallback) so the app can load one chapter at a time.
  let chapters: { title: string; text: string; images?: ExtractedImage[] }[] | undefined;
  if (lightMode) {
    const bounds = await detectChapters(pdf, pageTexts);
    if (bounds.length >= 2) {
      // Surviving images per page (the global dupe/chrome filter above
      // already decided which captures to keep via `drop`).
      const byPage = new Map<number, Cap[]>();
      captured.forEach((c, idx) => {
        if (drop.has(idx)) return;
        const list = byPage.get(c.page) ?? [];
        list.push(c);
        byPage.set(c.page, list);
      });
      // Each chapter gets its own images array with ids renumbered from 0,
      // markers appended at the owning page's position in the chapter text.
      const buildChapter = (from: number, to: number) => {
        const imgs: ExtractedImage[] = [];
        const pieces: string[] = [];
        for (let p = from; p < to; p++) {
          let t = pageTexts[p]!;
          for (const c of byPage.get(p + 1) ?? []) {
            const id = imgs.length;
            imgs.push({ id, src: c.src, page: c.page });
            t += ` ${imageMarker(id)} `;
          }
          pieces.push(t);
        }
        const text = pieces.join("\n\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        return { text, images: imgs.length ? imgs : undefined };
      };
      chapters = [];
      if (bounds[0]!.startPage > 0) {
        const fm = buildChapter(0, bounds[0]!.startPage);
        if (fm.text.split(/\s+/).length > 150) chapters.push({ title: "Front matter", ...fm });
      }
      for (let i = 0; i < bounds.length; i++) {
        const from = bounds[i]!.startPage;
        const to = i + 1 < bounds.length ? bounds[i + 1]!.startPage : pageTexts.length;
        const c = buildChapter(from, to);
        if (c.text.split(/\s+/).length > 30) chapters.push({ title: bounds[i]!.title, ...c });
      }
      if (chapters.length < 2) chapters = undefined;
    }
  }

  return {
    title: file.name.replace(/\.pdf$/i, ""),
    text: fullText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    source: "pdf",
    meta: {
      pages: pdf.numPages,
      imageCount: images.length,
      droppedImages: captured.length - images.length,
    },
    images: images.length ? images : undefined,
    chapters,
  };
}

/** Find chapter boundaries: prefer the PDF's own outline/bookmarks, fall
 *  back to "Chapter N" / "Part N" headings at the top of a page. */
async function detectChapters(
  pdf: any,
  pageTexts: string[],
): Promise<{ title: string; startPage: number }[]> {
  try {
    const outline = await pdf.getOutline();
    if (outline && outline.length >= 2) {
      // Flatten one level of nesting: many books put chapters as children
      // of part entries, and part-sized chunks are too big to read in one go.
      const flat: any[] = [];
      const walk = (entries: any[], depth: number) => {
        for (const it of entries ?? []) {
          flat.push(it);
          if (depth < 1 && Array.isArray(it.items) && it.items.length) walk(it.items, depth + 1);
        }
      };
      walk(outline, 0);
      const items: { title: string; startPage: number }[] = [];
      for (const it of flat) {
        try {
          let dest = it.dest;
          if (typeof dest === "string") dest = await pdf.getDestination(dest);
          if (!dest || !dest[0]) continue;
          const pageIndex = await pdf.getPageIndex(dest[0]);
          const title = String(it.title ?? "").replace(/\s+/g, " ").trim();
          items.push({ title: title || `Section ${items.length + 1}`, startPage: pageIndex });
        } catch { /* skip malformed outline entries */ }
      }
      const sorted = items
        .sort((a, b) => a.startPage - b.startPage)
        .filter((c, i, arr) => i === 0 || c.startPage > arr[i - 1]!.startPage);
      if (sorted.length >= 2) return sorted;
    }
  } catch { /* no outline */ }
  const found: { title: string; startPage: number }[] = [];
  const CH_RE = /(^|\n)\s*((?:chapter|part)\s+(?:[0-9]+|[ivxlc]+)\b[^\n]{0,80})/i;
  for (let i = 0; i < pageTexts.length; i++) {
    const m = pageTexts[i]!.slice(0, 400).match(CH_RE);
    if (m) found.push({ title: m[2]!.replace(/\s+/g, " ").trim().slice(0, 80), startPage: i });
  }
  return found.length >= 2 ? found : [];
}
