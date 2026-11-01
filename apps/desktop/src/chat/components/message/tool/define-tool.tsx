import type { I18n } from "@lingui/core";
import { useLingui } from "@lingui/react";
import type { ReactNode } from "react";

import {
  ToolCard,
  ToolCardFooters,
  ToolCardHeader,
  useMcpOutput,
  useToolState,
} from "./shared";

type ToolPart = {
  toolCallId: string;
  state: string;
  output?: unknown;
  // deno-lint-ignore no-explicit-any
  input?: Record<string, any>;
  errorText?: unknown;
};

// deno-lint-ignore no-explicit-any
type Input = Record<string, any> | undefined;

type ToolConfig<TParsed> = {
  icon: ReactNode;
  parseFn: (output: unknown) => TParsed | null;
  label: (ctx: {
    i18n: I18n;
    running: boolean;
    failed: boolean;
    parsed: TParsed | null;
    input: Input;
  }) => string;
  isDone?: (parsed: TParsed | null) => boolean;
  renderBody?: (input: Input, parsed: TParsed | null) => ReactNode;
  renderSuccess?: (parsed: TParsed) => ReactNode;
  renderFooter?: (ctx: {
    i18n: I18n;
    failed: boolean;
    errorText: unknown;
    rawText: string | null;
    parsed: TParsed | null;
    toolCallId: string;
  }) => ReactNode;
};

export function defineTool<TParsed>(config: ToolConfig<TParsed>) {
  return ({ part }: { part: ToolPart }) => {
    const { i18n } = useLingui();
    const { running, failed, done } = useToolState(part);
    const { parsed, rawText } = useMcpOutput(done, part.output, config.parseFn);
    const headerDone = config.isDone ? config.isDone(parsed) : !!parsed;

    return (
      <ToolCard failed={failed}>
        <ToolCardHeader
          icon={config.icon}
          running={running}
          failed={failed}
          done={headerDone}
          label={config.label({
            i18n,
            running,
            failed,
            parsed,
            input: part.input,
          })}
        />
        {config.renderBody?.(part.input, parsed)}
        {config.renderFooter ? (
          config.renderFooter({
            i18n,
            failed,
            errorText: part.errorText,
            rawText,
            parsed,
            toolCallId: part.toolCallId,
          })
        ) : (
          <ToolCardFooters
            failed={failed}
            errorText={part.errorText}
            rawText={rawText}
          >
            {parsed ? config.renderSuccess?.(parsed) : null}
          </ToolCardFooters>
        )}
      </ToolCard>
    );
  };
}
