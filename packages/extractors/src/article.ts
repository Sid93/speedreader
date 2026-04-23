import type { ExtractResult } from "./index.js";

// Uses r.jina.ai — a free article-extraction proxy that strips nav/ads and
// returns clean markdown. No API key needed, no CORS issues.
// Swappable later for a Cloudflare Worker + Readability.js.
export async function extractArticle(url: string): Promise<ExtractResult> {
  if (!/^https?:\/\//i.test(url)) throw new Error("URL must start with http(s)://");

  const target = `https://r.jina.ai/${url}`;
  const res = await fetch(target, {
    headers: { Accept: "text/plain" },
  });
  if (!res.ok) throw new Error(`Article fetch failed: ${res.status} ${res.statusText}`);

  const raw = await res.text();

  // r.jina.ai output begins with "Title:", "URL Source:", etc., then the body.
  const titleMatch = raw.match(/^Title:\s*(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? url;

  const bodyStart = raw.indexOf("Markdown Content:");
  const body = bodyStart >= 0 ? raw.slice(bodyStart + "Markdown Content:".length) : raw;

  const text = body
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text, source: "article", meta: { url } };
}
