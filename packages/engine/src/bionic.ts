export interface BionicPart {
  bold: string;
  rest: string;
}

// Split a single word so the first ~boldRatio of its letters are "bold".
// Short words (<=3 chars) bold 1 letter; longer words scale up.
export function bionicSplit(word: string, boldRatio = 0.45): BionicPart {
  // Strip leading/trailing non-letters so they render outside the bold prefix.
  const leadMatch = word.match(/^[^a-zA-Z0-9]*/);
  const trailMatch = word.match(/[^a-zA-Z0-9]*$/);
  const lead = leadMatch?.[0] ?? "";
  const trail = trailMatch?.[0] ?? "";
  const core = word.slice(lead.length, word.length - trail.length);
  if (core.length === 0) return { bold: "", rest: word };

  const letters = core.replace(/[^a-zA-Z]/g, "").length;
  let boldCount: number;
  if (letters <= 1) boldCount = 1;
  else if (letters <= 3) boldCount = 1;
  else if (letters <= 6) boldCount = Math.ceil(letters * boldRatio);
  else boldCount = Math.min(core.length - 1, Math.round(letters * boldRatio));
  boldCount = Math.max(1, Math.min(core.length, boldCount));

  return {
    bold: lead + core.slice(0, boldCount),
    rest: core.slice(boldCount) + trail,
  };
}
