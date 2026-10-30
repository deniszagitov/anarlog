import {
  getSummaryEligibility,
  type SummaryEligibility,
  type SummaryEligibilitySkipCode,
} from "@anlg/utils/summary-eligibility";

import { countNormalizedCharacters } from "./summary-length";

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export type EnhanceEligibilitySkipCode = SummaryEligibilitySkipCode;

export function getEligibility(
  transcripts: ReadonlyArray<{
    words: ReadonlyArray<{ text?: unknown }>;
  }>,
): SummaryEligibility {
  const text = transcripts
    .flatMap((transcript) => transcript.words)
    .map((word) => (typeof word.text === "string" ? word.text : ""))
    .join(" ");

  return getSummaryEligibility({
    transcriptCount: transcripts.length,
    wordCount: Array.from(wordSegmenter.segment(text)).filter(
      (segment) => segment.isWordLike,
    ).length,
    characterCount: countNormalizedCharacters(text),
  });
}
