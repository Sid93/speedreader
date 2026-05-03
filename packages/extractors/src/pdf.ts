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

export async function extractPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;

  const images: ExtractedImage[] = [];
  let fullText = "";
  let nextImgId = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = pageItemsToText(content.items as any[]);
    if (i > 1) fullText += "\n\n";
    fullText += pageText;

    // Best-effort image extraction. Quietly skip if it fails for this page.
    try {
      const pageImages = await extractPageImages(pdfjs, page);
      for (const img of pageImages) {
        const id = nextImgId++;
        images.push({ id, src: img.src, page: i });
        fullText += ` ${imageMarker(id)} `;
      }
    } catch {
      /* skip */
    }
  }

  return {
    title: file.name.replace(/\.pdf$/i, ""),
    text: fullText.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    source: "pdf",
    meta: { pages: pdf.numPages, imageCount: images.length },
    images: images.length ? images : undefined,
  };
}
