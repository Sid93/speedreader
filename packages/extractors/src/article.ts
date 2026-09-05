import type { ExtractResult, ExtractedImage, ExtractedLink, ExtractedAside } from "./index.js";
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

  return parseJinaMarkdown(await res.text(), url);
}

/**
 * Pure transform from a raw r.jina.ai response to an ExtractResult.
 * Split out from extractArticle so it can be tested against fixtures
 * without any network access.
 */
export function parseJinaMarkdown(raw: string, url = ""): ExtractResult {
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
  // 4. Strip link wrappers FIRST so a linked image becomes a bare placeholder
  //    (⟦⟧ placeholders contain no markdown brackets, so this is safe) — but
  //    capture the hrefs on the way out so the reader can list every link the
  //    article contained. Self-links (footnotes/anchors), share widgets, and
  //    image-CDN wrappers are noise, not references.
  const links: ExtractedLink[] = [];
  const seenHref = new Set<string>();
  const pageBase = url.split("#")[0];
  const JUNK_LINK_RE = /substackcdn\.com\/image|\/(sharer|intent\/tweet|share\?)|action=share|\/subscribe(\?|$)|\/comments(\?|$)/i;
  const TWEET_RE = /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/]+\/status\//i;
  body = body.replace(/\[([^\[\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label: string, href: string) => {
    const text = (label ?? "").replace(/⟦I\d+⟧/g, "").replace(/\s+/g, " ").trim();
    if (
      /^https?:\/\//i.test(href) &&
      text &&
      href.split("#")[0] !== pageBase &&
      !JUNK_LINK_RE.test(href) &&
      !seenHref.has(href) &&
      links.length < 100
    ) {
      seenHref.add(href);
      links.push({ text: text.slice(0, 160), href });
    }
    // Embedded tweet cards (long linked blocks pointing at a tweet) break the
    // reading flow — move the text to an aside, but keep any images from the
    // embed (charts in tweets are real content) as flow pause-points.
    if (TWEET_RE.test(href) && text.split(/\s+/).length > 15) {
      const embedImages = (label.match(/⟦I\d+⟧/g) ?? []).map((p) => `\n\n${p}\n\n`).join("");
      return `${embedImages}\n\n⟬embed⟭${text}\n\n`;
    }
    return label;
  });

  // 4b. Figure captions: an italic-only line straight after an image is the
  //     picture's caption, not body text — attach it to the image (the
  //     overlay shows it under the picture) and lift it out of the flow.
  body = body.replace(
    /⟦I(\d+)⟧[ \t]*\n+[ \t]*(?:\*|_)([^\n]{4,240}?)(?:\*|_)[ \t]*(?=\n|$)/g,
    (_m, idxStr: string, cap: string) => {
      const c = captured[Number(idxStr)];
      if (c) c.alt = c.alt ? `${c.alt} — ${cap.trim()}` : cap.trim();
      return ` ⟦I${idxStr}⟧ `;
    },
  );

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

  // 6. Blockquotes: short ones stay in the flow with visible ❝ ❞ bounds
  //    (glued to the first/last words so skip-punctuation can't swallow
  //    them); LONG ones are flow-breakers and move to the asides panel.
  body = body.replace(/(?:^[ \t]*>.*(?:\n|$))+/gm, (block) => {
    const inner = block.replace(/^[ \t]*>\s?/gm, "").replace(/\s+/g, " ").trim();
    if (!inner) return "\n\n";
    if (inner.split(/\s+/).length > 40) return `\n\n⟬quote⟭${inner}\n\n`;
    return `\n\n❝${inner}❞\n\n`;
  });
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

  // 10. Final flow pass: drop decorative pull quotes (short paragraphs that
  //     duplicate body text), and move flow-breakers — tagged embeds/long
  //     quotes plus promo interjections — into the asides list with the word
  //     position they came from.
  const { text: cleaned, asides } = extractAsides(body);
  body = cleaned;

  return {
    title,
    text: body,
    source: "article",
    meta: { url, imageCount: images.length },
    images: images.length ? images : undefined,
    links: links.length ? links : undefined,
    asides: asides.length ? asides : undefined,
  };
}

// Promotional interjections are SHORT standalone paragraphs — a whole
// paragraph of CTA language. Long body paragraphs that merely mention
// subscriptions or Twitter are never touched (word-count guard below).
const PROMO_RE = new RegExp(
  [
    /subscribe (now|today|for free|to)/.source,
    /becom(e|ing) a (paid|free|premium) (subscriber|member|supporter)/.source,
    /upgrade (to|your) (paid|premium|subscription)/.source,
    /upgrade your (research|reading|experience)/.source,
    /follow (me|us) on (x\b|twitter|instagram|threads|linkedin|facebook|youtube|bluesky|mastodon)/.source,
    /share this (post|article|essay)/.source,
    /^share$|^leave a comment$|^restack$|^subscribe$/.source,
    /leave a comment/.source,
    /refer a friend|referral (link|program)/.source,
    /pledge your support/.source,
    /thanks for reading/.source,
    /this post is public/.source,
    /buy me a coffee|patreon/.source,
    /(download|get) the (substack )?app/.source,
    /free (7|14|30)[- ]day trial|start free trial/.source,
    /for paid subscribers( only)?/.source,
    /sign up (for|to) (my|our|the)/.source,
    /get \d+% off/.source,
  ].join("|"),
  "i",
);

/**
 * Final flow pass. Walks paragraphs of the cleaned text and:
 *  - moves ⟬embed⟭/⟬quote⟭-tagged paragraphs into asides,
 *  - moves short standalone CTA paragraphs into asides (kind "promo"),
 *  - drops decorative pull quotes (short paragraphs duplicated inside a
 *    longer paragraph elsewhere) entirely,
 * recording for each aside the word index where it sat in the final text.
 */
export function extractAsides(text: string): { text: string; asides: ExtractedAside[] } {
  const paras = text.split(/\n\n+/);
  const norm = (s: string) => s.replace(/[❝❞]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const normed = paras.map((p) => (p.startsWith("⟬") ? "" : norm(p)));
  const asides: ExtractedAside[] = [];
  const kept: string[] = [];
  let wordIdx = 0;
  for (let i = 0; i < paras.length; i++) {
    const p = paras[i]!.trim();
    if (!p) continue;
    const tag = p.match(/^⟬(embed|quote|promo)⟭/);
    if (tag) {
      asides.push({ kind: tag[1] as ExtractedAside["kind"], text: p.slice(tag[0].length).trim(), at: wordIdx });
      continue;
    }
    const words = p.split(/\s+/).filter(Boolean);
    const hasImg = /‹IMG:\d+›/.test(p);
    if (!hasImg && words.length <= 25 && PROMO_RE.test(p)) {
      asides.push({ kind: "promo", text: p, at: wordIdx });
      continue;
    }
    const n = normed[i]!;
    const wc = n ? n.split(" ").length : 0;
    if (!hasImg && wc >= 8 && wc <= 60 &&
        normed.some((other, j) => j !== i && other.length > n.length && other.includes(n))) {
      continue; // decorative pull quote — pure duplication, drop it
    }
    kept.push(p);
    wordIdx += words.length;
  }
  return { text: kept.join("\n\n"), asides };
}
