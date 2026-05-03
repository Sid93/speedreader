import type { ExtractResult, ExtractedImage } from "./index.js";
import { imageMarker } from "./index.js";

// Uses r.jina.ai — a free article-extraction proxy that strips nav/ads and
// returns clean markdown. Swappable later for a Cloudflare Worker + Readability.js.
export async function extractArticle(url: string): Promise<ExtractResult> {
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http(s)://");

  const target = `https://r.jina.ai/${url}`;
  const res = await fetch(target, {
    headers: { Accept: "text/plain" },
  });
  if (!res.ok) throw new Error(`Article fetch failed: ${res.status} ${res.statusText}`);

  const raw = await res.text();

  const titleMatch = raw.match(/^Title:\s*(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? url;

  const bodyStart = raw.indexOf("Markdown Content:");
  let body = bodyStart >= 0 ? raw.slice(bodyStart + "Markdown Content:".length) : raw;

  // ── Markdown cleanup, in an order safe for image markers ──────────────
  // 1. Pull out fenced code blocks first (we keep the inner text but drop fences).
  body = body.replace(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g, (_m, inner) => `\n${inner}\n`);

  // 2. Inline code: keep the text, drop the backticks (was previously deleted entirely).
  body = body.replace(/`+([^`\n]+)`+/g, "$1");

  // 3. Replace images with safe markers BEFORE we touch links — even when
  //    nested inside a link wrapper like `[![alt](src)](url)`.
  const images: ExtractedImage[] = [];
  let nextImgId = 0;
  body = body.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, src: string) => {
    if (!/^https?:\/\//i.test(src)) return "";
    const id = nextImgId++;
    images.push({ id, src, alt: alt?.trim() || undefined });
    return ` ${imageMarker(id)} `;
  });

  // 4. Strip link wrappers, keeping the link text (which now may contain a
  //    marker if it wrapped an image). Use [^\[\]]* in the text capture so
  //    we never traverse through other brackets and accidentally swallow
  //    later markers, which was the bug that corrupted markers before.
  body = body.replace(/\[([^\[\]]*)\]\([^)\s]+(?:\s+"[^"]*")?\)/g, "$1");

  // 5. Drop heading hash prefixes (keep heading text).
  body = body.replace(/^#{1,6}\s+/gm, "");

  // 6. Drop blockquote markers, list bullets, table pipes.
  body = body.replace(/^>\s?/gm, "");
  body = body.replace(/^[ \t]*[-*+]\s+/gm, "");
  body = body.replace(/^[ \t]*\d+\.\s+/gm, "");

  // 7. Strip emphasis markers but keep the text inside.
  body = body.replace(/(\*\*|__)(.+?)\1/g, "$2");
  body = body.replace(/(\*|_)([^*_\n]+?)\1/g, "$2");

  // 8. Strip stray HTML tags; keep their inner text.
  body = body.replace(/<\/?[a-zA-Z][^>]*>/g, "");

  // 9. Whitespace cleanup.
  body = body
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title,
    text: body,
    source: "article",
    meta: { url, imageCount: images.length },
    images: images.length ? images : undefined,
  };
}
