import { Trans, useLingui } from "@lingui/react/macro";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from "react";

import { Button } from "@anlg/ui/components/ui/button";
import { Input } from "@anlg/ui/components/ui/input";
import { toast } from "@anlg/ui/components/ui/toast";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import {
  createSessionTitleEditor,
  loadSessionTitleForEdit,
  SessionTitleEditError,
} from "../title-edit";

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/shared/ui/dialog";
import {
  GlassDialogCancelButton,
  GlassDialogContent,
} from "~/shared/ui/glass-dialog";

const RenameContext = createContext<((sessionId: string) => void) | null>(null);

export function useRequestSessionRename() {
  return useContext(RenameContext);
}

export function SessionRenameProvider({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const [request, setRequest] = useState<{
    sessionId: string;
    title: string;
    revision: number;
  } | null>(null);
  const revision = useRef(0);
  const { mutate: open } = useMutation({
    mutationFn: async ({
      sessionId,
    }: {
      sessionId: string;
      revision: number;
    }) => loadSessionTitleForEdit(sessionId),
    onSuccess: (title, target) => {
      if (target.revision === revision.current)
        setRequest({ ...target, title });
    },
    onError: (error, target) => {
      if (target.revision !== revision.current) return;
      if (error instanceof SessionTitleEditError && error.reason === "locked")
        return;
      toast.error(t`Could not open this note for renaming.`);
    },
  });
  const requestRename = useCallback(
    (sessionId: string) => {
      setRequest(null);
      open({ sessionId, revision: ++revision.current });
    },
    [open],
  );

  return (
    <RenameContext.Provider value={requestRename}>
      {children}
      {request && (
        <SessionRenameDialog
          key={`${request.sessionId}:${request.revision}`}
          sessionId={request.sessionId}
          initialTitle={request.title}
          onClose={() => {
            if (request.revision !== revision.current) return;
            revision.current += 1;
            setRequest(null);
          }}
          onReload={() => requestRename(request.sessionId)}
        />
      )}
    </RenameContext.Provider>
  );
}

function SessionRenameDialog({
  sessionId,
  initialTitle,
  onClose,
  onReload,
}: {
  sessionId: string;
  initialTitle: string;
  onClose: () => void;
  onReload: () => void;
}) {
  const { t } = useLingui();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [editor] = useState(() => createSessionTitleEditor(sessionId));
  const save = useMutation({
    mutationFn: (title: string) => editor.save(title, initialTitle),
    onSuccess: onClose,
  });
  const form = useForm({
    defaultValues: { title: initialTitle },
    onSubmit: async ({ value }) => {
      if (save.isPending) return;
      await save.mutateAsync(value.title.trim()).catch(() => {});
    },
  });
  useMountEffect(() => () => editor.cancel());

  const close = () => {
    if (!save.isPending) onClose();
  };
  const conflict =
    save.error instanceof SessionTitleEditError &&
    save.error.reason === "conflict";
  const error = save.error
    ? conflict
      ? t`This note changed in another window. Reload its title before trying again.`
      : save.error instanceof SessionTitleEditError &&
          save.error.reason === "missing"
        ? t`This note no longer exists.`
        : save.error instanceof SessionTitleEditError &&
            save.error.reason === "locked"
          ? t`Unlock this note before renaming it.`
          : t`Could not rename this note. Please try again.`
    : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <GlassDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const input = inputRef.current;
          input?.focus();
          input?.select();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            <Trans>Rename note</Trans>
          </DialogTitle>
          <DialogDescription className="sr-only">
            <Trans>Choose a new name for this note.</Trans>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field
            name="title"
            validators={{
              onChange: ({ value }) =>
                !value.trim() ? t`Enter a note name.` : undefined,
            }}
          >
            {(field) => (
              <>
                <Input
                  ref={inputRef}
                  autoFocus
                  aria-label={t`Note name`}
                  aria-invalid={field.state.meta.errors.length > 0}
                  aria-describedby={errorId}
                  value={field.state.value}
                  disabled={save.isPending}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                    editor.preview(event.target.value, initialTitle);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.nativeEvent.isComposing || event.keyCode === 229)
                    )
                      event.preventDefault();
                  }}
                />
                <p
                  id={errorId}
                  role="alert"
                  className="text-destructive mt-2 text-xs"
                >
                  {field.state.meta.errors[0] ?? error}
                </p>
              </>
            )}
          </form.Field>
          {conflict && (
            <Button type="button" variant="ghost" onClick={onReload}>
              <Trans>Reload current title</Trans>
            </Button>
          )}
          <DialogFooter className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
            <GlassDialogCancelButton disabled={save.isPending} onClick={close}>
              <Trans>Cancel</Trans>
            </GlassDialogCancelButton>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.values.title]}
            >
              {([canSubmit, title]) => (
                <Button
                  type="submit"
                  disabled={
                    !canSubmit || !String(title).trim() || save.isPending
                  }
                  className="h-8 rounded-full text-xs"
                >
                  <Trans>Rename</Trans>
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </GlassDialogContent>
    </Dialog>
  );
}
