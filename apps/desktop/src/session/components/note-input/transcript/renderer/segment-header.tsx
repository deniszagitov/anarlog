import { Check } from "@anlg/ui/components/icons";
import { cn } from "@anlg/utils";

import { useTranscriptSelectionState } from "./selection-context";
import { SpeakerAssignPopover } from "./speaker-assign";
import { useSegmentColorVars } from "./utils";

import type { Segment, SegmentWord } from "~/stt/live-segment";
import {
  getTranscriptTimingSource,
  isTranscriptWordSeekable,
} from "~/stt/timing";

export function SegmentHeader({
  segment,
  transcriptId,
  sessionId,
  label,
  selected = false,
  offsetMs = 0,
  seekAndPlay,
}: {
  segment: Segment;
  transcriptId: string;
  sessionId?: string;
  label: string;
  selected?: boolean;
  offsetMs?: number;
  seekAndPlay?: (word: SegmentWord) => void;
}) {
  const { selectMode } = useTranscriptSelectionState();
  const colorVars = useSegmentColorVars(segment.key);
  const firstWord = segment.words[0];
  const timestamp = firstWord
    ? formatTimestamp(offsetMs + firstWord.start_ms)
    : null;
  const approximate =
    firstWord && getTranscriptTimingSource(firstWord) !== "provider_word";
  const headerClassName = cn([
    "relative py-1",
    "text-xs font-light",
    "flex items-center gap-2",
    "[--segment-color:var(--segment-color-light)]",
    "dark:[--segment-color:var(--segment-color-dark)]",
  ]);

  return (
    <div className={headerClassName} style={colorVars}>
      {selectMode ? (
        <span
          aria-hidden="true"
          className={cn([
            "flex size-4 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          ])}
        >
          {selected ? <Check className="size-2.5" weight="bold" /> : null}
        </span>
      ) : null}
      {timestamp ? (
        <button
          type="button"
          disabled={
            selectMode ||
            !seekAndPlay ||
            !firstWord ||
            !isTranscriptWordSeekable(firstWord)
          }
          onClick={() => firstWord && seekAndPlay?.(firstWord)}
          className={cn([
            "shrink-0 rounded px-1 py-0.5 font-mono text-xs tabular-nums",
            "text-muted-foreground hover:text-foreground disabled:pointer-events-none",
            "focus-visible:ring-primary/40 focus-visible:ring-2 focus-visible:outline-none",
          ])}
        >
          {approximate ? "≈ " : ""}
          {timestamp}
        </button>
      ) : null}
      <SpeakerAssignPopover
        segment={segment}
        transcriptId={transcriptId}
        sessionId={sessionId}
        color="var(--segment-color)"
        label={label}
      />
    </div>
  );
}

function formatTimestamp(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const clock = [minutes, seconds % 60].map((value) =>
    String(value).padStart(2, "0"),
  );
  if (hours > 0) clock.unshift(String(hours).padStart(2, "0"));
  return clock.join(":");
}
