import { expect, it } from "vitest";

import { splitTranscriptParagraphs } from "./paragraphs";

import type { Segment } from "~/stt/live-segment";

it("breaks long speaker turns into timed paragraphs without losing words or speaker identity", () => {
  const segment: Segment = {
    id: "long-turn",
    key: {
      channel: "MixedCapture",
      speaker_index: 3,
      speaker_human_id: null,
    },
    speaker_label: "Speaker 4",
    start_ms: 0,
    end_ms: 62_950,
    text: "",
    words: Array.from({ length: 90 }, (_, index) => ({
      id: `word-${index}`,
      text: `word${index}${index === 26 || index === 60 ? "." : ""}`,
      start_ms: index * 700,
      end_ms: index * 700 + 650,
      channel: "MixedCapture",
      is_final: true,
    })),
  };

  const paragraphs = splitTranscriptParagraphs(segment);

  expect(paragraphs).toHaveLength(3);
  expect(paragraphs.flatMap((paragraph) => paragraph.words)).toEqual(
    segment.words,
  );
  expect(paragraphs.map((paragraph) => paragraph.words[0].start_ms)).toEqual([
    0, 18_900, 42_700,
  ]);
  expect(paragraphs.every((paragraph) => paragraph.key === segment.key)).toBe(
    true,
  );
  expect(
    paragraphs.every((paragraph) => paragraph.speaker_label === "Speaker 4"),
  ).toBe(true);
});
