import type { ExtractResult } from "./index.js";

export async function extractText(
  text: string,
  title = "Pasted text",
): Promise<ExtractResult> {
  return { title, text: text.trim(), source: "text" };
}
