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
