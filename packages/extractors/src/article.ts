import type { ExtractResult, ExtractedImage } from "./index.js";
import { imageMarker } from "./index.js";

// Common patterns for navigation/UI/tracking images that the reader should
// silently drop rather than pause on. Better to miss a real image now and
// then than to make every page a slideshow of menus and pixels.
const JUNK_ALT_RE = /^(menu|search|close|arrow|sign\s*in|subscribe|login|logo|icon|burger|hamburger|spotify|youtube|twitter|x\s*\/\s*twitter|linkedin|apple\s*podcasts?|rss|email|share|tag|profile|avatar|footer|header)/i;
const JUNK_URL_RE = /(^|\/)(icons?|logos?|assets|sprites?|pixel|favicon|trans_?1x1|spacer|blank)(\/|[._-])|(1x1\.gif)|(google-analytics|googletagmanager|doubleclick|facebook\.com\/tr)/i;
// Things that strongly suggest "this is content (a chart/figure/diagram)"
// even if the URL or alt has otherwise generic shape.
const CHART_HINT_RE = /(chart|graph|figure|diagram|plot|fig[_-]?\d|viz|visuali[sz]ation|infographic)/i;

function isJunkImage(src: string, alt: string): boolean {
  const a = (alt ?? "").trim();
  // Chart-like signals override the junk filters so SVG charts pass.
  if (CHART_HINT_RE.test(src) || (a && CHART_HINT_RE.test(a))) return false;
  if (a && JUNK_ALT_RE.test(a)) return true;
  if (JUNK_URL_RE.test(src)) return true;
  // SVG: drop only if it looks like an icon (in /icons/, /assets/, /static/,
  // or filename has hyphenated single short word like "search.svg"). Anything
  // longer or with chart hints is allowed.
  if (/\.svg($|\?)/i.test(src)) {
    if (/\/(icons?|assets|static|sprites?|svg)\//i.test(src)) return true;
    const name = (src.match(/\/([^\/?#]+)\.svg/i)?.[1] ?? "");
    if (name.length <= 12 && !/[0-9_-].{4}/.test(name)) return true;
  }
  // Substack/other CDNs often include dimensions in URL: skip if explicit tiny.
  const dim = src.match(/[?&]w=(\d+)/) || src.match(/[?&]width=(\d+)/);
  if (dim && Number(dim[1]) < 80) return true;
  // Substack CDN puts transform dims in the path (…/fetch/w_40,h_40,c_fill/…):
  // tiny widths there are avatars/badges, not content.
  const pathDim = src.match(/[/,]w_(\d+)[,/]/);
  if (pathDim && Number(pathDim[1]) < 80) return true;
  return false;
}

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

  // 3. Two-pass image handling:
  //    a) Replace markdown images with placeholder tokens, capturing src/alt.
  //    b) Drop junk (nav/logos/icons/1x1, dupes) and any *clusters* of 2+
  //       consecutive markers (almost always a nav strip), then renumber.
  type Cap = { src: string; alt: string };
  const captured: Cap[] = [];
  body = body.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, src: string) => {
    if (!/^https?:\/\//i.test(src)) return "";
    captured.push({ src, alt: (alt ?? "").trim() });
    return ` ⟦I${captured.length - 1}⟧ `;
  });

  // Drop junk + dupes by replacing their placeholders with empty space.
  const seenSrc = new Set<string>();
  for (let i = 0; i < captured.length; i++) {
    const { src, alt } = captured[i]!;
    if (isJunkImage(src, alt) || seenSrc.has(src)) {
      body = body.replace(`⟦I${i}⟧`, " ");
    } else {
      seenSrc.add(src);
    }
  }
  // 4. Strip link wrappers FIRST so a linked image becomes a bare placeholder.
  //    Placeholders use ⟦⟧ (not markdown brackets) so this is safe.
  body = body.replace(/\[([^\[\]]*)\]\([^)\s]+(?:\s+"[^"]*")?\)/g, "$1");

  // 5. Now drop runs of 2+ placeholders adjacent ON THE SAME LINE — those are
  //    nav strips (rows of icons). Images in adjacent *paragraphs* are almost
  //    always real content (common on Substack), so newlines break a run.
  body = body.replace(/⟦I\d+⟧(?:[ \t]*⟦I\d+⟧)+/g, " ");

  // 6. Convert surviving placeholders to real markers + build the images list.
  const images: ExtractedImage[] = [];
  body = body.replace(/⟦I(\d+)⟧/g, (_m, idxStr: string) => {
    const cap = captured[Number(idxStr)]!;
    const id = images.length;
    images.push({ id, src: cap.src, alt: cap.alt || undefined });
    return ` ${imageMarker(id)} `;
  });

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
