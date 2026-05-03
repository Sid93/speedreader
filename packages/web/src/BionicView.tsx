import { useMemo } from "react";
import { bionicSplit } from "@speedreader/engine";

export function BionicView({ text, fontSize, intensity = 0.45, fontFamily }: { text: string; fontSize: number; intensity?: number; fontFamily?: string }) {
  const paragraphs = useMemo(
    () => text.split(/\n\s*\n/)
      .map((p) => p.replace(/\s*‹IMG:\d+›\s*/g, " ").replace(/[ \t]+/g, " ").trim())
      .filter((p) => p.length > 0),
    [text],
  );

  return (
    <div className="bionic" style={{ fontSize, fontFamily }}>
      {paragraphs.map((p, pi) => (
        <p key={pi}>
          {p.split(/\s+/).filter(Boolean).map((w, wi) => {
            const { bold, rest } = bionicSplit(w, intensity);
            return (
              <span key={wi} className="bw">
                <b>{bold}</b>
                <span>{rest}</span>
                {" "}
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}
