import type { Segment } from "~/stt/live-segment";

export function splitTranscriptParagraphs(segment: Segment): Segment[] {
  const paragraphs: Segment["words"][] = [];
  let current: Segment["words"] = [];

  for (const word of segment.words) {
    const first = current[0];
    const previous = current[current.length - 1];
    if (first && previous) {
      const sentenceBoundary =
        previous.end_ms - first.start_ms >= 15_000 &&
        /[.!?…]["'»”)]?$/.test(previous.text.trim());
      const pause =
        current.length >= 8 && word.start_ms - previous.end_ms >= 1_500;
      const limit =
        word.end_ms - first.start_ms > 30_000 || current.length >= 80;
      if (sentenceBoundary || pause || limit) {
        paragraphs.push(current);
        current = [];
      }
    }
    current.push(word);
  }
  if (current.length > 0) paragraphs.push(current);
  if (paragraphs.length <= 1) return [segment];

  return paragraphs.map((words) => ({
    ...segment,
    id: `${segment.id}:paragraph:${words[0].id ?? words[0].start_ms}`,
    start_ms: words[0].start_ms,
    end_ms: words[words.length - 1].end_ms,
    text: words.map((word) => word.text.trim()).join(" "),
    words,
  }));
}
