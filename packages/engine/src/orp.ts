export interface OrpParts {
  before: string;
  orp: string;
  after: string;
}

export function getORP(word: string): OrpParts {
  const clean = word.replace(/[^a-zA-Z0-9]/g, "");
  const len = clean.length || word.length;
  const orp = Math.max(0, Math.floor(len * 0.3));
  return {
    before: word.slice(0, orp),
    orp: word.slice(orp, orp + 1),
    after: word.slice(orp + 1),
  };
}
