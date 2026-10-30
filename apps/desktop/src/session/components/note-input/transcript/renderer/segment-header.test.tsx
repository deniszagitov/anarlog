import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SegmentHeader } from "./segment-header";

import type { Segment } from "~/stt/live-segment";

vi.mock("./speaker-assign", () => ({
  SpeakerAssignPopover: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

beforeEach(() => {
  cleanup();
});

describe("SegmentHeader", () => {
  it("seeks to a visible timestamp using the recording offset", () => {
    const seekAndPlay = vi.fn();
    const segment = createRemoteSegment(2);
    render(
      <SegmentHeader
        transcriptId="transcript-1"
        sessionId="session-1"
        label="Speaker 3"
        segment={segment}
        offsetMs={3_600_000}
        seekAndPlay={seekAndPlay}
      />,
    );

    expect(screen.getByRole("button", { name: "Speaker 3" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "01:00:12" }));
    expect(seekAndPlay).toHaveBeenCalledWith(segment.words[0]);
  });

  it("labels remote live segments as the unique other participant", () => {
    render(
      <SegmentHeader
        transcriptId="transcript-1"
        sessionId="session-1"
        label="Artem"
        segment={createRemoteSegment(0)}
      />,
    );

    expect(screen.getByRole("button", { name: "Artem" })).toBeTruthy();
  });

  it("updates cached remote labels when session participants change", () => {
    const segment = createRemoteSegment(0);
    const { rerender } = render(
      <SegmentHeader
        transcriptId="transcript-1"
        sessionId="session-1"
        label="Artem"
        segment={segment}
      />,
    );

    expect(screen.getByRole("button", { name: "Artem" })).toBeTruthy();

    rerender(
      <SegmentHeader
        transcriptId="transcript-1"
        sessionId="session-1"
        label="Speaker 1"
        segment={segment}
      />,
    );

    expect(screen.getByRole("button", { name: "Speaker 1" })).toBeTruthy();
  });
});

function createRemoteSegment(speakerIndex: number): Segment {
  return {
    id: "segment-1",
    key: {
      channel: "RemoteParty",
      speaker_index: speakerIndex,
      speaker_human_id: null,
    },
    start_ms: 12_000,
    end_ms: 18_000,
    text: "hello world",
    words: [
      {
        id: "word-1",
        text: "hello",
        start_ms: 12_000,
        end_ms: 13_000,
        channel: "RemoteParty",
        is_final: true,
      },
    ],
  } as Segment;
}
