import { applySessionContentCorrections } from "./content-mutations";

import { liveQueryClient } from "~/db";
import { isLockedFlag } from "~/lock/flag";
import { revealLockedNote } from "~/lock/notes";
import { useLiveTitle } from "~/store/zustand/live-title";

export class SessionTitleEditError extends Error {
  constructor(readonly reason: "missing" | "locked" | "conflict") {
    super(reason);
  }
}

export async function loadSessionTitleForEdit(sessionId: string) {
  const [session] = await liveQueryClient.execute<{
    title: string;
    locked: boolean | number;
  }>("SELECT title, locked FROM sessions WHERE id = ? AND deleted_at IS NULL", [
    sessionId,
  ]);
  if (!session) throw new SessionTitleEditError("missing");
  if (isLockedFlag(session.locked) && !(await revealLockedNote(sessionId))) {
    throw new SessionTitleEditError("locked");
  }
  return session.title;
}

export function createSessionTitleEditor(sessionId: string) {
  let base: { title: string } | undefined;
  let preview:
    | ReturnType<typeof useLiveTitle.getState>["titles"][string]
    | undefined;
  let pending: Promise<unknown> = Promise.resolve();

  const cancel = () => {
    const store = useLiveTitle.getState();
    if (preview && store.titles[sessionId] === preview) {
      store.clearTitle(sessionId);
    }
    preview = undefined;
    base = undefined;
  };

  return {
    preview(value: string, previousTitle: string | undefined) {
      base ??= { title: previousTitle ?? "" };
      const store = useLiveTitle.getState();
      store.setTitle(sessionId, value);
      preview = useLiveTitle.getState().titles[sessionId];
    },
    save(value: string, previousTitle: string | undefined) {
      const editBase = (base ??= { title: previousTitle ?? "" });
      const editPreview = preview;
      const save = pending
        .catch(() => {})
        .then(async () => {
          try {
            const currentTitle = await loadSessionTitleForEdit(sessionId);
            const expectedTitle = editBase.title;
            if (currentTitle !== expectedTitle && currentTitle !== value) {
              throw new SessionTitleEditError("conflict");
            }
            if (currentTitle !== value) {
              await applySessionContentCorrections({
                sessionId,
                summaries: [],
                transcripts: [],
                title: { currentTitle: expectedTitle, nextTitle: value },
              });
            }
            editBase.title = value;
            const store = useLiveTitle.getState();
            if (editPreview && store.titles[sessionId] === editPreview) {
              if (editPreview.value !== value) store.setTitle(sessionId, value);
              store.markTitlePersisted(sessionId, value, expectedTitle);
              preview = undefined;
              if (base === editBase) base = undefined;
            }
          } catch (error) {
            if (
              editPreview &&
              useLiveTitle.getState().titles[sessionId] === editPreview
            ) {
              cancel();
            }
            if (
              error instanceof Error &&
              /^transaction statement \d+ affected 0 rows; expected 1$/.test(
                error.message,
              )
            ) {
              throw new SessionTitleEditError("conflict");
            }
            throw error;
          }
        });
      pending = save;
      return save;
    },
    cancel,
  };
}
