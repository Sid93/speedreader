export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

export function isPunctuationOnly(word: string): boolean {
  return /^[^a-zA-Z0-9]+$/.test(word);
}
