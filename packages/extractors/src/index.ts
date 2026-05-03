export { extractPdf } from "./pdf.js";
export { extractText } from "./text.js";
export { extractArticle } from "./article.js";
export { extractEpub } from "./epub.js";

export interface ExtractedImage {
  /** Stable id; matches the [[IMG:id]] marker that appears in `text`. */
  id: number;
  /** Either a data URL (PDF embedded) or an absolute URL (article). */
  src: string;
  alt?: string;
  /** Source page (PDF only). */
  page?: number;
}

export interface ExtractResult {
  title: string;
  /**
   * Plain text, with image markers in the form `[[IMG:n]]` where `n` is the
   * id of an entry in `images`. Markers are surrounded by whitespace so they
   * survive the standard tokenizer as standalone tokens.
   */
  text: string;
  source: "pdf" | "text" | "article" | "epub";
  meta?: Record<string, unknown>;
  images?: ExtractedImage[];
}

/** Regex used by readers to detect image marker tokens. */
export const IMG_TOKEN_RE = /^\[\[IMG:(\d+)\]\]$/;

/** Helper for consumers: returns the image id if `word` is a marker, else null. */
export function imageIdForToken(word: string): number | null {
  const m = word.match(IMG_TOKEN_RE);
  return m ? Number(m[1]) : null;
}
