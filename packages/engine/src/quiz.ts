// Cloze-style multiple-choice comprehension quiz.
// Pure logic — no AI, no network. Picks dense sentences and blanks out one
// content word per question; distractors come from elsewhere in the same text.

export interface QuizQuestion {
  sentence: string;          // Full original sentence
  before: string;            // Text before the blank
  after: string;             // Text after the blank
  answer: string;            // The correct word (stripped)
  options: string[];         // 4 shuffled options incl. answer
}

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","of","to","in","on","at","for","with","by",
  "is","are","was","were","be","been","being","this","that","these","those",
  "it","its","they","them","their","he","she","his","her","we","us","our",
  "you","your","i","my","me","as","if","so","not","no","yes","do","does","did",
  "have","has","had","will","would","could","should","may","might","can","than",
  "then","there","here","when","where","who","what","which","why","how",
  "from","about","into","over","under","also","only","just","very","more","most",
  "some","any","all","each","every","other","another","such","own","same"
]);

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function cleanWord(w: string): string {
  return w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
}

function isContentWord(raw: string): boolean {
  const c = cleanWord(raw);
  if (c.length < 5) return false;
  if (!/^[a-zA-Z][a-zA-Z'-]*$/.test(c)) return false;
  if (STOP_WORDS.has(c.toLowerCase())) return false;
  return true;
}

function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// Deterministic PRNG so same doc+seed gives same quiz (nice for re-tests).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface QuizOptions {
  count?: number;   // how many questions (default 3)
  seed?: number;    // PRNG seed; default derived from text length
}

export function buildQuiz(text: string, opts: QuizOptions = {}): QuizQuestion[] {
  const count = Math.max(1, Math.min(10, opts.count ?? 3));
  const seed = opts.seed ?? text.length;
  const rnd = mulberry32(seed);

  const sentences = splitSentences(text).filter((s) => s.split(/\s+/).length >= 6);
  if (sentences.length === 0) return [];

  // Pool of content words across the whole text (for distractors).
  const allContent = Array.from(
    new Set(
      text
        .split(/\s+/)
        .map(cleanWord)
        .filter((w) => isContentWord(w)),
    ),
  );
  if (allContent.length < 4) return [];

  // Score sentences by number of content words; prefer denser.
  const scored = sentences
    .map((s) => {
      const words = s.split(/\s+/);
      const content = words.filter(isContentWord);
      return { s, words, content, score: content.length };
    })
    .filter((x) => x.content.length >= 2)
    .sort((a, b) => b.score - a.score);

  const picked = new Set<string>();
  const questions: QuizQuestion[] = [];

  for (const { s, words, content } of scored) {
    if (questions.length >= count) break;
    if (picked.has(s)) continue;

    // Pick a content word from the sentence.
    const candidate = content[Math.floor(rnd() * content.length)]!;
    const answer = cleanWord(candidate);
    if (!answer) continue;

    // Find the first occurrence in the word list and build before/after.
    const idx = words.findIndex((w) => cleanWord(w) === answer);
    if (idx < 0) continue;
    const before = words.slice(0, idx).join(" ");
    const after = words.slice(idx + 1).join(" ");

    // Distractors: 3 other content words, roughly matching length, not the answer.
    const pool = allContent
      .filter((w) => w.toLowerCase() !== answer.toLowerCase())
      .sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length));
    const distractors: string[] = [];
    for (const w of shuffle(pool.slice(0, Math.min(20, pool.length)), rnd)) {
      if (distractors.length >= 3) break;
      if (!distractors.some((d) => d.toLowerCase() === w.toLowerCase())) distractors.push(w);
    }
    if (distractors.length < 3) continue;

    const options = shuffle([answer, ...distractors], rnd);
    questions.push({ sentence: s, before, after, answer, options });
    picked.add(s);
  }

  return questions;
}
