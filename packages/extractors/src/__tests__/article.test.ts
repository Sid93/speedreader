import { describe, it, expect } from "vitest";
import { parseJinaMarkdown } from "../article.js";
import { IMG_TOKEN_RE, imageIdForToken } from "../index.js";

const URL = "https://example.substack.com/p/test-post";

/** Build a minimal r.jina.ai-style response around the given markdown body. */
function jina(body: string, title = "Test Post"): string {
  return `Title: ${title}\n\nURL Source: ${URL}\n\nMarkdown Content:\n${body}`;
}

function markers(text: string): string[] {
  return text.match(/‹IMG:\d+›/g) ?? [];
}

describe("parseJinaMarkdown — basics", () => {
  it("extracts the title and strips markdown", () => {
    const r = parseJinaMarkdown(jina("# Heading\n\nSome **bold** and _italic_ and `code`.", "My Title"), URL);
    expect(r.title).toBe("My Title");
    expect(r.text).toContain("Heading");
    expect(r.text).toContain("Some bold and italic and code.");
    expect(r.text).not.toMatch(/[#*_`]/);
  });

  it("keeps a single content image with a marker matching its id", () => {
    const r = parseJinaMarkdown(jina("Intro.\n\n![Image 1](https://cdn.example.com/photo_1600x900.jpeg)\n\nOutro."));
    expect(r.images).toHaveLength(1);
    expect(markers(r.text)).toEqual(["‹IMG:0›"]);
    expect(imageIdForToken("‹IMG:0›")).toBe(0);
    expect(IMG_TOKEN_RE.test(r.text)).toBe(true);
  });

  it("unwraps linked images (Substack style) into bare markers", () => {
    const r = parseJinaMarkdown(jina(
      "Text.\n\n[![Image 1](https://cdn.example.com/a.jpeg)](https://cdn.example.com/full.jpeg)\n\nMore text.",
    ));
    expect(r.images).toHaveLength(1);
    expect(markers(r.text)).toHaveLength(1);
    expect(r.text).not.toContain("](");
  });
});

describe("parseJinaMarkdown — junk filtering", () => {
  it("keeps images in ADJACENT PARAGRAPHS (Substack chart-after-chart)", () => {
    const r = parseJinaMarkdown(jina(
      "Setup.\n\n![Image 1](https://cdn.example.com/one.png)\n\n![Image 2](https://cdn.example.com/two.png)\n\nAfter.",
    ));
    // Regression: these used to be dropped as a "nav strip".
    expect(r.images).toHaveLength(2);
    expect(markers(r.text)).toEqual(["‹IMG:0›", "‹IMG:1›"]);
  });

  it("drops same-line runs of images (real nav strips)", () => {
    const r = parseJinaMarkdown(jina(
      "Header junk: ![a](https://x.com/a.png) ![b](https://x.com/b.png) ![c](https://x.com/c.png)\n\nBody text.\n\n![Image 1](https://cdn.example.com/real.png)\n\nEnd.",
    ));
    expect(r.images).toHaveLength(1);
    expect(r.images![0]!.src).toContain("real.png");
  });

  it("drops tiny path-dimension images (Substack w_40 avatars)", () => {
    const r = parseJinaMarkdown(jina(
      "Tweet: ![Image 1: X avatar](https://substackcdn.com/image/fetch/w_40,h_40,c_fill/https%3A%2F%2Fx.com%2Fav.png) quote text.\n\n![Image 2](https://substackcdn.com/image/fetch/w_1456,c_limit/https%3A%2F%2Fx.com%2Fchart-data.png)\n\nEnd.",
    ));
    expect(r.images).toHaveLength(1);
    expect(r.images![0]!.src).toContain("w_1456");
  });

  it("drops tiny query-dimension images", () => {
    const r = parseJinaMarkdown(jina("A ![pic](https://cdn.example.com/i.png?w=32) B.\n\nLonger paragraph."));
    expect(r.images ?? []).toHaveLength(0);
  });

  it("drops duplicates, nav-alt images, and non-http sources", () => {
    const r = parseJinaMarkdown(jina([
      "![Image 1](https://cdn.example.com/hero.jpeg)",
      "",
      "Paragraph one.",
      "",
      "![Image 1 dupe](https://cdn.example.com/hero.jpeg)",
      "",
      "![menu](https://cdn.example.com/other.png)",
      "",
      "![inline data](data:image/png;base64,AAAA)",
      "",
      "The end.",
    ].join("\n")));
    expect(r.images).toHaveLength(1);
    expect(markers(r.text)).toEqual(["‹IMG:0›"]);
  });

  it("keeps chart-hinted SVGs but drops icon SVGs", () => {
    const r = parseJinaMarkdown(jina(
      "![Revenue chart](https://cdn.example.com/media/revenue-chart-q3.svg)\n\nBody.\n\n![](https://cdn.example.com/icons/search.svg)\n\nEnd.",
    ));
    expect(r.images).toHaveLength(1);
    expect(r.images![0]!.src).toContain("revenue-chart");
  });

  it("renumbers surviving images so markers always match image ids", () => {
    const r = parseJinaMarkdown(jina(
      "![menu](https://cdn.example.com/nav.png)\n\nText.\n\n![Image 2](https://cdn.example.com/keep-me.png)\n\nEnd.",
    ));
    expect(r.images).toHaveLength(1);
    expect(r.images![0]!.id).toBe(0);
    expect(markers(r.text)).toEqual(["‹IMG:0›"]);
  });
});
