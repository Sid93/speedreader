import { saveDoc, saveProgress, type LibraryDoc } from "@speedreader/storage";
import { tokenize } from "@speedreader/engine";

// Demo-mode seeding, driven by ?demo=<reader|overlay|links|library>[&at=N].
// Used to stage repeatable states for App Store screenshots and QA. Inert
// unless the query parameter is present.

const DEMO_TEXT = `Reading fast is not about rushing. It is about giving your eyes fewer places to wander.

The Fixation Problem

Untrained reading spends most of its time in motion, not comprehension. Your eyes jump, settle, drift back, and re-read lines you already understood. Researchers call these regressions, and they can consume a third of your reading time without adding anything.

‹IMG:0›

RSVP - rapid serial visual presentation - removes the wandering entirely. Words come to a fixed point, one phrase at a time, and your eyes simply stay still. The speed comes free; the discipline is in the pacing.

Phrases, Not Words

A trained reader does not read words. They read phrases, whole units of meaning, in a single glance. That is why this reader groups words into natural phrases that never break across a sentence boundary, so the rhythm of the text survives the speed.

❝The art of reading is to skip judiciously - and the craft is knowing what not to skip.❞

Pictures are different. A chart deserves your full attention, so the flow pauses on every image, shows it large, and resumes exactly where you left off.

‹IMG:1›

Finding Your Place

Long reads take more than one sitting. The dots under the progress bar mark every image in the article - natural break points. Hover to preview, click to jump. The picture itself becomes your bookmark.

‹IMG:2›

What To Do Next

Start at 350 words per minute with four-word phrases. When the quiz after each article feels easy, raise the pace. Most people double their reading speed within two weeks without losing comprehension - not because their eyes got faster, but because they finally stopped moving.`;

const DEMO_IMAGES: LibraryDoc["images"] = [
  { id: 0, src: "demo/chart1.png", alt: "Where reading time goes — regressions eat a third of it" },
  { id: 1, src: "demo/chart2.png", alt: "Reading speed over two weeks of RSVP practice" },
  { id: 2, src: "demo/chart3.png", alt: "Every image becomes a place finder on the scrubber" },
];

const DEMO_LINKS: LibraryDoc["links"] = [
  { text: "Rayner (1998), Eye movements in reading: 20 years of research", href: "https://example.com/rayner-1998" },
  { text: "The case for phrase-chunked presentation", href: "https://example.com/phrase-chunking" },
  { text: "Regressions and comprehension: what re-reading actually buys you", href: "https://example.com/regressions" },
  { text: "RSVP reading on small displays", href: "https://example.com/rsvp-displays" },
];

const EXTRA_DOCS: { title: string; words: number }[] = [
  { title: "The Elite Overproduction Hypothesis", words: 3564 },
  { title: "AI #124: Grokless Interlude", words: 12504 },
  { title: "Annual Letter 2026: Notes on Compounding", words: 6210 },
];

export interface DemoState {
  mode: string;
  doc?: LibraryDoc;
}

/** Seeds demo content when ?demo= is present. Returns null otherwise. */
export async function maybeSeedDemo(): Promise<DemoState | null> {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("demo");
  if (!mode) return null;

  const doc = await saveDoc({
    title: "The Craft of Reading Faster",
    text: DEMO_TEXT,
    source: "article",
    wordCount: tokenize(DEMO_TEXT).length,
    images: DEMO_IMAGES,
    links: DEMO_LINKS,
  });

  if (mode === "library") {
    for (const [i, d] of EXTRA_DOCS.entries()) {
      const filler = `${d.title}. ${"word ".repeat(Math.max(1, d.words - tokenize(d.title).length + 1))}`.trim();
      const saved = await saveDoc({
        title: d.title,
        text: filler,
        source: "article",
        wordCount: tokenize(filler).length,
      });
      if (i === 1) await saveProgress(saved.id, Math.round(d.words * 0.42));
    }
    return { mode };
  }

  const at = Number(params.get("at") ?? 0);
  if (at > 0) await saveProgress(doc.id, at);
  return { mode, doc };
}
