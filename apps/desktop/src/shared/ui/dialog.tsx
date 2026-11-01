import { useLingui } from "@lingui/react/macro";
import type { ComponentProps } from "react";

import { DialogContent as SharedDialogContent } from "@anlg/ui/components/ui/dialog";

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@anlg/ui/components/ui/dialog";

export function DialogContent(
  props: ComponentProps<typeof SharedDialogContent>,
) {
  const { t } = useLingui();
  return (
    <SharedDialogContent {...props} closeLabel={props.closeLabel ?? t`Close`} />
  );
}
