import { expect, test } from "vitest";
import { createStore } from "zustand/vanilla";

import { type BatchActions, type BatchState, createBatchSlice } from "./batch";

import type { WordLike } from "~/stt/segment";
import {
  getTranscriptTimingSource,
  isTranscriptWordSeekable,
} from "~/stt/timing";

test("text-only ASR keeps its audio span without claiming word alignment", () => {
  const store = createStore<BatchState & BatchActions>((set, get) =>
    createBatchSlice(set, get),
  );
  let persisted: WordLike[] = [];
  const text = "A complete transcript without word timestamps.";
  store.getState().setBatchPersist("local-asr", (words) => {
    persisted = words;
  });
  store.getState().handleBatchResponse("local-asr", {
    metadata: { timing_source: "audio_chunk" },
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: text,
              confidence: 0,
              words: [
                {
                  word: text,
                  punctuated_word: text,
                  start: 0,
                  end: 11.48,
                  confidence: 0,
                  channel: 0,
                  speaker: null,
                },
              ],
            },
          ],
        },
      ],
    },
  });

  expect(persisted).toHaveLength(1);
  expect(persisted[0].text.trim()).toBe(text);
  expect([persisted[0].start_ms, persisted[0].end_ms]).toEqual([0, 11_480]);
  expect(getTranscriptTimingSource(persisted[0])).toBe("synthetic_text");
  expect(isTranscriptWordSeekable(persisted[0])).toBe(false);
});
