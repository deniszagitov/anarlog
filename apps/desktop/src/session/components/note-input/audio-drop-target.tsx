import { Trans, useLingui } from "@lingui/react/macro";
import type { HTMLAttributes, ReactNode } from "react";

import { Waveform } from "@anlg/ui/components/icons";
import { cn } from "@anlg/utils";

import { AUDIO_EXTENSIONS } from "~/stt/useUploadFile";

export function AudioDropTarget({
  children,
  className,
  isActive,
  targetProps,
}: {
  children: ReactNode;
  className?: string;
  isActive: boolean;
  targetProps: HTMLAttributes<HTMLDivElement>;
}) {
  const { t } = useLingui();
  const labels = AUDIO_EXTENSIONS.map((extension) => extension.toUpperCase());
  const previous = labels.slice(0, -1).join(", ");
  const last = labels[labels.length - 1] ?? "";
  const supportedAudioFormats =
    labels.length > 1 ? t`${previous}, or ${last}` : last;
  return (
    <div {...targetProps} className={cn(["relative min-h-full", className])}>
      {isActive && (
        <div
          role="status"
          className={cn([
            "pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border border-dashed",
            "border-border/70 bg-background text-muted-foreground shadow-inner",
            "[background-image:radial-gradient(circle_at_center,_rgba(113,113,122,0.34)_1px,_transparent_1px)]",
            "[background-size:18px_18px]",
          ])}
        >
          <div className="border-border/70 bg-card/95 text-foreground flex items-center gap-3 rounded-md border px-4 py-3 shadow-sm">
            <Waveform className="text-muted-foreground size-5 shrink-0" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-medium">
                <Trans>Drop to upload and transcribe audio</Trans>
              </p>
              <p className="text-muted-foreground text-xs">
                {supportedAudioFormats} <Trans>audio</Trans>
              </p>
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
