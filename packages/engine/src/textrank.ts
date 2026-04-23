// Unsupervised TextRank-ish sentence extraction.
// Each sentence is scored by its graph centrality; edges weighted by word
// overlap (minus stop-words). Returns sentences in original order.

const STOP = new Set([
  "a","an","and","or","but","of","to","in","on","at","for","with","by","is",
  "are","was","were","be","been","being","this","that","these","those","it",
  "its","they","them","their","he","she","his","her","we","us","our","you",
  "your","i","my","me","as","if","so","not","no","yes","do","does","did",
  "have","has","had","will","would","could","should","may","might","can",
  "than","then","there","here","when","where","who","what","which","why",
  "how","from","about","into","over","under","also","only","just","very",
  "more","most","some","any","all","each","every","other","another","such",
  "own","same","up","down","out","off","again","once",
]);

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'"'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function keyTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function sim(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const w of a) if (setB.has(w)) shared++;
  // Normalize by geometric-ish mean of sentence lengths.
  return shared / (Math.log(a.length + 1) + Math.log(b.length + 1));
}

/**
 * Return indices of the top-N% most central sentences.
 * ratio: 0.15 means ~15% of sentences.
 */
export function skimSentenceIndices(text: string, ratio = 0.2): number[] {
  const sentences = splitSentences(text);
  const n = sentences.length;
  if (n === 0) return [];
  if (n <= 3) return sentences.map((_, i) => i);

  const toks = sentences.map(keyTokens);
  // Build similarity graph, then iterate centrality (PageRank style).
  const score = new Array(n).fill(1 / n);
  const d = 0.85;
  // Precompute row sums for normalization.
  const sums = new Array(n).fill(0);
  const mat: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const w = sim(toks[i]!, toks[j]!);
      mat[i]![j] = w;
      sums[i] += w;
    }
  }
  for (let iter = 0; iter < 30; iter++) {
    const next = new Array(n).fill((1 - d) / n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (sums[j]! > 0 && mat[j]![i]! > 0) {
          next[i] += d * (mat[j]![i]! / sums[j]!) * score[j]!;
        }
      }
    }
    for (let i = 0; i < n; i++) score[i] = next[i];
  }
  const targetCount = Math.max(3, Math.round(n * ratio));
  const idx = score
    .map((s: number, i: number) => ({ s, i }))
    .sort((a: {s: number; i: number}, b: {s: number; i: number}) => b.s - a.s)
    .slice(0, targetCount)
    .map((x: {s: number; i: number}) => x.i)
    .sort((a: number, b: number) => a - b);
  return idx;
}

export function skim(text: string, ratio = 0.2): string {
  const sentences = splitSentences(text);
  const picks = skimSentenceIndices(text, ratio);
  return picks.map((i) => sentences[i]).join(" ");
}

export function sentences(text: string): string[] {
  return splitSentences(text);
}
