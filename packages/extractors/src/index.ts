export { extractPdf } from "./pdf.js";
export { extractText } from "./text.js";
export { extractArticle } from "./article.js";
export { extractEpub } from "./epub.js";

export interface ExtractResult {
  title: string;
  text: string;
  source: "pdf" | "text" | "article" | "epub";
  meta?: Record<string, unknown>;
}
