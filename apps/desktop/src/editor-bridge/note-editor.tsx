import { useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";

import { NoteEditor as SharedNoteEditor } from "@anlg/editor/note";

export function NoteEditor(props: ComponentProps<typeof SharedNoteEditor>) {
  const { t } = useLingui();
  return (
    <SharedNoteEditor
      {...props}
      labels={{
        formatToolbar: {
          formatSelection: t`Format selection`,
          comment: t`Comment`,
          bold: t`Bold`,
          italic: t`Italic`,
          underline: t`Underline`,
          strike: t`Strikethrough`,
          code: t`Code`,
          highlight: t`Highlight`,
          ...props.labels?.formatToolbar,
        },
        slashCommands: {
          title: t`Commands`,
          commands: {
            paragraph: { label: t`Text`, description: t`Plain text` },
            heading1: { label: t`Heading 1`, description: t`Large heading` },
            heading2: { label: t`Heading 2`, description: t`Medium heading` },
            heading3: { label: t`Heading 3`, description: t`Small heading` },
            bulletList: {
              label: t`Bullet List`,
              description: t`Unordered list`,
            },
            orderedList: {
              label: t`Numbered List`,
              description: t`Ordered list`,
            },
            taskList: {
              label: t`Task List`,
              description: t`List with checkboxes`,
            },
            blockquote: { label: t`Quote`, description: t`Block quote` },
            codeBlock: {
              label: t`Code Block`,
              description: t`Code with syntax highlighting`,
            },
            horizontalRule: {
              label: t`Divider`,
              description: t`Horizontal rule`,
            },
          },
          ...props.labels?.slashCommands,
        },
      }}
    />
  );
}
