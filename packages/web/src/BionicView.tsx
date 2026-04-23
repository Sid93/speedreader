import { useMemo } from "react";
import { bionicSplit } from "@speedreader/engine";

export function BionicView({ text, fontSize, intensity = 0.45 }: { text: string; fontSize: number; intensity?: number }) {
  const paragraphs = useMemo(() => text.split(/\n\s*\n/), [text]);

  return (
    <div className="bionic" style={{ fontSize }}>
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
