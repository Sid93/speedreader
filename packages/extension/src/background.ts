// Service worker: registers context menus and stages text for the reader tab.

const MENU_PAGE = "speedreader-page";
const MENU_SELECTION = "speedreader-selection";
const STAGED_KEY = "sr.staged";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_PAGE,
    title: "Speed read this page",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: MENU_SELECTION,
    title: "Speed read selection",
    contexts: ["selection"],
  });
});

/**
 * Runs INSIDE the page (injected via chrome.scripting), so it sees exactly
 * what the logged-in user sees — including paywalled content (Substack etc.)
 * that an anonymous fetch through r.jina.ai would never get.
 *
 * Must be fully self-contained: no imports, no closed-over variables.
 * Emits the same ‹IMG:n› markers the extractors package uses.
 */
function extractFromDom(): {
  title: string;
  text: string;
  images: { id: number; src: string; alt?: string }[];
  links: { text: string; href: string }[];
  asides: { kind: "quote" | "embed" | "promo"; text: string; at: number }[];
} {
  const SKIP_SELECTOR = [
    "script", "style", "noscript", "nav", "header", "footer", "aside", "form",
    "button", "svg", "iframe", "audio", "video", "textarea", "select",
    // Substack chrome: subscribe/share widgets, like bars, comments, paywall CTAs
    ".subscription-widget-wrap", ".subscribe-widget", ".post-ufi", ".post-footer",
    ".comments-section", ".paywall", "[class*='paywall-']", ".share-dialog",
    "[data-component-name='SubscribeWidget']",
    // Decorative pull quotes duplicate body text — skip them entirely.
    "[class*='pullquote']", ".pull-quote",
    // In-post CTA blocks: share/subscribe/upgrade buttons rendered inline
    // in the article body (Substack wraps them in button containers).
    ".button-wrapper", "[class*='captioned-button']", "[class*='button-wrap']",
    ".install-substack-app", "[data-component-name*='Share']",
    "[data-component-name*='Subscribe']", ".digest-cta",
  ].join(",");

  const images: { id: number; src: string; alt?: string }[] = [];
  const seenSrc = new Set<string>();
  const links: { text: string; href: string }[] = [];
  const seenHref = new Set<string>();
  const pageBase = location.href.split("#")[0];
  const JUNK_LINK_RE = /substackcdn\.com\/image|\/(sharer|intent\/tweet|share\?)|action=share|\/subscribe(\?|$)|\/comments(\?|$)/i;
  const out: string[] = [];
  const BLOCK_RE = /^(P|DIV|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE|FIGURE|FIGCAPTION|TR|UL|OL|TABLE|SECTION)$/;

  function walk(el: Element): void {
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(node.textContent ?? "");
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const e = node as Element;
      try {
        if (e.matches(SKIP_SELECTOR)) continue;
      } catch { /* exotic elements can throw on matches() */ }
      if (e.tagName === "FIGCAPTION") {
        // A caption identifies its picture — attach it to the most recent
        // image so the overlay shows it under the photo, and keep it out of
        // the reading flow.
        const cap = ((e as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
        const lastImg = images[images.length - 1];
        if (cap && lastImg) lastImg.alt = lastImg.alt ? `${lastImg.alt} — ${cap}` : cap;
        continue;
      }
      try {
        if (e.matches(".tweet, .twitter-tweet, [data-component-name='Tweet'], .tweet-embed")) {
          // Embedded tweets break the flow: keep their images as pause
          // points, move the text to the asides panel.
          for (const img of Array.from(e.querySelectorAll("img"))) {
            const im = img as HTMLImageElement;
            const src = im.currentSrc || im.src || "";
            const w = im.naturalWidth || Number(im.getAttribute("width")) || 0;
            if (/^https?:\/\//i.test(src) && w >= 200 && !seenSrc.has(src)) {
              seenSrc.add(src);
              images.push({ id: images.length, src, alt: im.alt || undefined });
              out.push(`\n\n‹IMG:${images.length - 1}›\n\n`);
            }
          }
          const t = ((e as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
          if (t) out.push(`\n\n⟬embed⟭${t}\n\n`);
          continue;
        }
      } catch { /* matches() can throw on exotic elements */ }
      if (e.tagName === "BLOCKQUOTE") {
        // Short quotes stay in the flow with ❝ ❞ bounds; long ones are
        // flow-breakers and move to the asides panel.
        const before = out.length;
        walk(e);
        const quoted = out.splice(before).join(" ").replace(/\s+/g, " ").trim();
        if (quoted) {
          if (quoted.split(" ").length > 40) out.push(`\n\n⟬quote⟭${quoted}\n\n`);
          else out.push(`\n\n❝${quoted}❞\n\n`);
        }
        continue;
      }
      if (e.tagName === "A") {
        // Record the hyperlink (readers can't click mid-RSVP), then keep
        // walking so the anchor text still lands in the body.
        const href = (e as HTMLAnchorElement).href || "";
        const label = ((e as HTMLElement).innerText || "").replace(/\s+/g, " ").trim();
        if (
          /^https?:\/\//i.test(href) &&
          label &&
          href.split("#")[0] !== pageBase &&
          !JUNK_LINK_RE.test(href) &&
          !seenHref.has(href) &&
          links.length < 100
        ) {
          seenHref.add(href);
          links.push({ text: label.slice(0, 160), href });
        }
      }
      if (e.tagName === "IMG") {
        const img = e as HTMLImageElement;
        const src = img.currentSrc || img.src || "";
        const w = img.naturalWidth || Number(img.getAttribute("width")) || 0;
        // Skip obvious icons/avatars and duplicates; w===0 means not loaded
        // yet — keep those, better a rare icon than a missing figure.
        if (/^https?:\/\//i.test(src) && (w === 0 || w >= 80) && !seenSrc.has(src)) {
          seenSrc.add(src);
          images.push({ id: images.length, src, alt: img.alt || undefined });
          out.push(` ‹IMG:${images.length - 1}› `);
        }
        continue;
      }
      walk(e);
      if (BLOCK_RE.test(e.tagName)) out.push("\n\n");
    }
  }

  // Prefer the tightest content container first — Substack's post body
  // (.available-content / .body.markup) excludes subscribe prompts and the
  // likes bar that live inside <article>; generic sites fall back to
  // article/main/body.
  const candidates = [
    document.querySelector(".available-content"), // Substack post body
    document.querySelector(".body.markup"), // Substack (older layouts)
    document.querySelector("article"),
    document.querySelector("main"),
    document.body,
  ].filter((el): el is HTMLElement => !!el);
  const root = candidates.find((el) => (el.innerText?.length ?? 0) > 500) ?? document.body;
  walk(root);

  let text = out
    .join(" ")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();

  // Final flow pass: move tagged embeds/long quotes and short promo
  // paragraphs into asides (recording their word position), and drop
  // decorative pull quotes that duplicate body text.
  const asides: { kind: "quote" | "embed" | "promo"; text: string; at: number }[] = [];
  {
    const PROMO_RE = /subscribe (now|today|for free|to)|becom(e|ing) a (paid|free|premium) (subscriber|member|supporter)|upgrade (to|your) (paid|premium|subscription)|upgrade your (research|reading|experience)|follow (me|us) on (x\b|twitter|instagram|threads|linkedin|facebook|youtube|bluesky|mastodon)|share this (post|article|essay)|^share$|^leave a comment$|^restack$|^subscribe$|leave a comment|refer a friend|referral (link|program)|pledge your support|thanks for reading|this post is public|buy me a coffee|patreon|(download|get) the (substack )?app|free (7|14|30)[- ]day trial|start free trial|for paid subscribers( only)?|sign up (for|to) (my|our|the)|get \d+% off/i;
    const paras = text.split(/\n\n+/);
    const norm = (x: string) => x.replace(/[❝❞]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const normed = paras.map((q) => (q.startsWith("⟬") ? "" : norm(q)));
    const kept: string[] = [];
    let wordIdx = 0;
    for (let i = 0; i < paras.length; i++) {
      const q = paras[i]!.trim();
      if (!q) continue;
      const tag = q.match(/^⟬(embed|quote|promo)⟭/);
      if (tag) {
        asides.push({ kind: tag[1] as "embed" | "quote" | "promo", text: q.slice(tag[0].length).trim(), at: wordIdx });
        continue;
      }
      const ws = q.split(/\s+/).filter(Boolean);
      const hasImg = /‹IMG:\d+›/.test(q);
      if (!hasImg && ws.length <= 25 && PROMO_RE.test(q)) {
        asides.push({ kind: "promo", text: q, at: wordIdx });
        continue;
      }
      const n = normed[i]!;
      const wc = n ? n.split(" ").length : 0;
      if (!hasImg && wc >= 8 && wc <= 60 &&
          normed.some((other, j) => j !== i && other.length > n.length && other.includes(n))) {
        continue;
      }
      kept.push(q);
      wordIdx += ws.length;
    }
    text = kept.join("\n\n");
  }

  const title =
    (document.querySelector("meta[property='og:title']") as HTMLMetaElement | null)?.content?.trim() ||
    (document.querySelector("h1.post-title") as HTMLElement | null)?.innerText?.trim() ||
    (document.querySelector("article h1, h1") as HTMLElement | null)?.innerText?.trim() ||
    document.title ||
    location.href;

  return { title, text, images, links, asides };
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === MENU_SELECTION && info.selectionText) {
    await chrome.storage.local.set({
      [STAGED_KEY]: {
        mode: "text",
        title: tab.title ?? "Selection",
        text: info.selectionText,
        at: Date.now(),
      },
    });
  } else if (info.menuItemId === MENU_PAGE && tab.url) {
    // First choice: read the live DOM (sees paywalled content the user is
    // logged in for). Fall back to URL mode (r.jina.ai) if the page yields
    // too little text — e.g. injection blocked on chrome:// or store pages.
    let staged: Record<string, unknown> | null = null;
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractFromDom,
      });
      const r = res?.result;
      if (r && r.text && r.text.length > 400) {
        staged = {
          mode: "dom",
          title: r.title || tab.title || tab.url,
          text: r.text,
          images: r.images.length ? r.images : undefined,
          links: r.links.length ? r.links : undefined,
          asides: r.asides.length ? r.asides : undefined,
          url: tab.url,
          at: Date.now(),
        };
      }
    } catch {
      // scripting not allowed on this page — fall through to URL mode
    }
    if (!staged) {
      staged = {
        mode: "url",
        title: tab.title ?? tab.url,
        url: tab.url,
        at: Date.now(),
      };
    }
    await chrome.storage.local.set({ [STAGED_KEY]: staged });
  } else {
    return;
  }

  await chrome.tabs.create({
    url: chrome.runtime.getURL("src/reader/index.html"),
  });
});
