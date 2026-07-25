export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

export function isPunctuationOnly(word: string): boolean {
  return /^[^a-zA-Z0-9]+$/.test(word);
}

/** Does this word end a sentence (., !, ?, possibly followed by quotes/brackets)? */
export function endsSentence(word: string): boolean {
  const trimmed = word.replace(/[\s"'"')\]}]+$/, "");
  return /[.!?]$/.test(trimmed);
}

// Mirrors the marker format from @speedreader/extractors (kept inline so the
// engine stays dependency-free): image markers always travel as their own
// chunk so the reader can pause exactly on them.
const IMG_MARKER_RE = /‹IMG:\d+›/;

/** Does this word end a clause (, ; :), ignoring trailing quotes/brackets? */
function endsClause(word: string): boolean {
  const trimmed = word.replace(/[\s"'"')\]}]+$/, "");
  return /[,;:]$/.test(trimmed);
}

/**
 * Phrase-aware chunk length starting at `start`, capped at `maxSize`.
 *
 * Instead of blindly grouping N words, a chunk:
 *  - never straddles a sentence end (. ! ?) — the sentence break always
 *    coincides with a chunk break;
 *  - prefers to break after a clause boundary (, ; :) once the chunk has
 *    reached at least half the target size;
 *  - never absorbs an image marker (markers get a chunk of their own).
 *
 * Deterministic and pure, so the scheduler and the display can both call it
 * with the same inputs and agree on the chunk.
 */
export function chunkLenAt(words: string[], start: number, maxSize: number): number {
  if (maxSize <= 1 || start >= words.length) return 1;
  if (IMG_MARKER_RE.test(words[start] ?? "")) return 1;
  const minBreak = Math.ceil(maxSize / 2);
  let len = 1;
  while (len < maxSize && start + len < words.length) {
    const last = words[start + len - 1]!;
    if (endsSentence(last)) break;
    if (len >= minBreak && endsClause(last)) break;
    if (IMG_MARKER_RE.test(words[start + len] ?? "")) break;
    len++;
  }
  return len;
}

/**
 * Walk backwards from `index` to find the first word right after a
 * sentence-ending one. If none found within `lookback`, returns `index`.
 * Useful for "resume but step back to sentence start" so re-entry is easier.
 */
export function sentenceStartAtOrBefore(
  words: string[],
  index: number,
  lookback = 40,
): number {
  if (index <= 0) return 0;
  const from = Math.max(0, index - lookback);
  for (let i = index - 1; i >= from; i--) {
    if (endsSentence(words[i]!)) return i + 1;
  }
  return from;
}
