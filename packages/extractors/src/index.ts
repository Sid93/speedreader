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

export interface ExtractedAside {
  /** What kind of interruption this was. */
  kind: "quote" | "embed" | "promo";
  /** The aside's text, removed from the reading flow. */
  text: string;
  /** Word index in the final text where it originally sat. */
  at: number;
}

export interface ExtractedLink {
  /** Link text as it appeared in the article (trimmed, capped). */
  text: string;
  /** Absolute http(s) URL. */
  href: string;
}

export interface ExtractResult {
  title: string;
  /**
   * Plain text, with image markers in the form `‹IMG:n›` where `n` is the
   * id of an entry in `images`. Uses U+2039 / U+203A so the marker contains
   * no markdown-special characters (no `[`, `]`, `(`, `)`, backticks) and
   * therefore survives any subsequent markdown cleanup. Surrounded by
   * whitespace so the standard tokenizer keeps it as a standalone token.
   */
  text: string;
  source: "pdf" | "text" | "article" | "epub";
  meta?: Record<string, unknown>;
  images?: ExtractedImage[];
  /** Hyperlinks found in the article body, in document order, deduped. */
  links?: ExtractedLink[];
  /** Flow-breaking content (embeds, long quotes, promos) moved out of `text`. */
  asides?: ExtractedAside[];
  /** For book-length sources: the text split into chapters. When present,
   *  the app should save chapters as separate docs instead of one giant one.
   *  Each chapter's images use ids local to that chapter (markers match). */
  chapters?: { title: string; text: string; images?: ExtractedImage[] }[];
}

/** Regex used by readers to detect image marker tokens. Lenient: matches
 *  even if surrounding punctuation got glued to the marker by tokenizing. */
export const IMG_TOKEN_RE = /‹IMG:(\d+)›/;

/** Helper for consumers: returns the image id if `word` contains a marker. */
export function imageIdForToken(word: string): number | null {
  const m = word.match(IMG_TOKEN_RE);
  return m ? Number(m[1]) : null;
}

/** Build a marker string for a given image id. */
export function imageMarker(id: number): string {
  return `‹IMG:${id}›`;
}
