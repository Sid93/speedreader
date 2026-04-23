import type { ExtractResult } from "./index.js";

// Lazy-load pdfjs so the initial bundle stays small.
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  // Use the bundled worker via Vite's ?url import at the call site; here we set
  // the worker from the same package so Vite can inline it.
  const workerUrl = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as string)
  ).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

export async function extractPdf(file: File): Promise<ExtractResult> {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    fullText += pageText + " ";
  }

  return {
    title: file.name.replace(/\.pdf$/i, ""),
    text: fullText.trim(),
    source: "pdf",
    meta: { pages: pdf.numPages },
  };
}
