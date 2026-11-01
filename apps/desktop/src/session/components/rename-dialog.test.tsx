import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  SessionRenameProvider,
  useRequestSessionRename,
} from "./rename-dialog";

import { createSessionTitleEditor } from "~/session/title-edit";
import {
  hasLiveSessionTitleDraft,
  useLiveTitle,
  useSessionTitle,
} from "~/store/zustand/live-title";

const state = vi.hoisted(() => ({
  rows: new Map<string, { title: string; locked: number }>(),
  authorize: vi.fn(async () => true),
  beforeWrite: vi.fn(async () => {}),
}));
vi.mock("~/db", () => ({
  liveQueryClient: {
    execute: async (_sql: string, [id]: string[]) => {
      const row = state.rows.get(id);
      return row ? [{ ...row }] : [];
    },
  },
}));
vi.mock("~/lock/notes", () => ({ revealLockedNote: state.authorize }));
vi.mock("~/session/content-mutations", () => ({
  applySessionContentCorrections: async ({
    sessionId,
    title,
    summaries,
    transcripts,
  }: {
    sessionId: string;
    title: { currentTitle: string; nextTitle: string };
    summaries: unknown[];
    transcripts: unknown[];
  }) => {
    await state.beforeWrite();
    const row = state.rows.get(sessionId);
    if (!row || row.title !== title.currentTitle)
      throw new Error("transaction statement 0 affected 0 rows; expected 1");
    if (summaries.length || transcripts.length)
      throw new Error("A rename must preserve note content");
    row.title = title.nextTitle;
  },
}));

function Target() {
  const rename = useRequestSessionRename();
  return <button onClick={() => rename?.("target")}>Rename other note</button>;
}
function Label() {
  const title = useSessionTitle("target", state.rows.get("target")?.title);
  return <output aria-label="Sidebar name">{title}</output>;
}
function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  const tree = (showRow: boolean) => (
    <QueryClientProvider client={client}>
      <SessionRenameProvider>
        {showRow && <Target />}
        <Label />
      </SessionRenameProvider>
    </QueryClientProvider>
  );
  const view = render(tree(true));
  return { ...view, hideRow: () => view.rerender(tree(false)) };
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Rename other note" }));
  return screen.findByRole("textbox", { name: "Note name" });
}
function submit(input: HTMLElement) {
  const form = input.closest("form");
  if (!form) throw new Error("Missing rename form");
  fireEvent.submit(form);
}
beforeEach(() => {
  state.rows.clear();
  state.rows.set("target", { title: "Other note", locked: 0 });
  state.rows.set("selected", { title: "Selected note", locked: 0 });
  state.authorize.mockReset();
  state.authorize.mockResolvedValue(true);
  state.beforeWrite.mockReset();
  state.beforeWrite.mockResolvedValue();
  useLiveTitle.setState({ titles: {} });
});
afterEach(cleanup);

it("renames the requested note after its row unmounts and keeps the selected note intact", async () => {
  const view = setup();
  const input = await open();
  expect(document.activeElement).toBe(input);
  view.hideRow();
  fireEvent.change(input, { target: { value: "  Итоги — встреча 📝  " } });
  submit(input);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(state.rows.get("target")?.title).toBe("Итоги — встреча 📝");
  expect(screen.getByLabelText("Sidebar name").textContent).toBe(
    "Итоги — встреча 📝",
  );
  expect(state.rows.get("selected")?.title).toBe("Selected note");
  expect(hasLiveSessionTitleDraft("target")).toBe(false);
});

it("preserves a failed rename draft and restores the saved name when cancelled", async () => {
  state.beforeWrite.mockRejectedValue(new Error("Storage unavailable"));
  setup();
  const input = await open();
  fireEvent.change(input, { target: { value: "Unsaved name" } });
  submit(input);
  await screen.findByText("Could not rename this note. Please try again.");
  expect(input).toHaveProperty("value", "Unsaved name");
  expect(state.rows.get("target")?.title).toBe("Other note");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByLabelText("Sidebar name").textContent).toBe("Other note");
});

it("rejects blank names and keeps the dialog open while a rename is pending", async () => {
  let finish = () => {};
  state.beforeWrite.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  setup();
  const input = await open();
  fireEvent.change(input, { target: { value: "   " } });
  submit(input);
  await screen.findByText("Enter a note name.");
  expect(state.rows.get("target")?.title).toBe("Other note");
  fireEvent.change(input, { target: { value: "안" } });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(state.rows.get("target")?.title).toBe("Other note");
  submit(input);
  await waitFor(() => expect(input).toHaveProperty("disabled", true));
  fireEvent.keyDown(input, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
    "disabled",
    true,
  );
  await act(async () => {
    finish();
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(state.rows.get("target")?.title).toBe("안");
});

it.each(["changed", "deleted"])(
  "does not overwrite a %s target and only reloads on request",
  async (change) => {
    setup();
    const input = await open();
    fireEvent.change(input, { target: { value: "My draft" } });
    if (change === "changed")
      state.beforeWrite.mockImplementationOnce(async () => {
        state.rows.set("target", { title: "Another window", locked: 0 });
      });
    else state.rows.delete("target");
    submit(input);
    await screen.findByText(
      change === "changed"
        ? "This note changed in another window. Reload its title before trying again."
        : "This note no longer exists.",
    );
    expect(input).toHaveProperty("value", "My draft");
    if (change === "deleted") {
      expect(state.rows.has("target")).toBe(false);
      return;
    }
    expect(state.rows.get("target")?.title).toBe("Another window");
    fireEvent.click(
      screen.getByRole("button", { name: "Reload current title" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Note name" })).toHaveProperty(
        "value",
        "Another window",
      ),
    );
    const reloaded = screen.getByRole("textbox", { name: "Note name" });
    fireEvent.change(reloaded, { target: { value: "Confirmed name" } });
    submit(reloaded);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(state.rows.get("target")?.title).toBe("Confirmed name");
  },
);

it("requires access to a locked note both when opening and when saving", async () => {
  state.rows.set("target", { title: "Locked name", locked: 1 });
  state.authorize.mockResolvedValue(false);
  setup();
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Rename other note" })),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  state.authorize.mockResolvedValue(true);
  const input = await open();
  fireEvent.change(input, { target: { value: "Protected edit" } });
  state.authorize.mockResolvedValue(false);
  submit(input);
  await screen.findByText("Unlock this note before renaming it.");
  expect(state.rows.get("target")?.title).toBe("Locked name");
  expect(input).toHaveProperty("value", "Protected edit");
});

it("does not clear another editor's identical preview when a pending write fails", async () => {
  let fail = (_error: Error) => {};
  state.beforeWrite.mockReturnValueOnce(
    new Promise<void>((_resolve, reject) => {
      fail = reject;
    }),
  );
  const older = createSessionTitleEditor("target");
  older.preview("Same draft", "Other note");
  const save = older.save("Same draft", "Other note").catch(() => {});
  await waitFor(() => expect(state.beforeWrite).toHaveBeenCalled());
  const newer = createSessionTitleEditor("target");
  newer.preview("Same draft", "Other note");
  fail(new Error("Write failed"));
  await save;
  older.cancel();
  expect(hasLiveSessionTitleDraft("target")).toBe(true);
  expect(useLiveTitle.getState().titles.target.value).toBe("Same draft");
  newer.cancel();
  expect(hasLiveSessionTitleDraft("target")).toBe(false);
});
