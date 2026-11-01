import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@anlg/ui/components/ui/tooltip";

import { TitleInput } from "./title-input";

import { useLiveTitle, useSessionTitle } from "~/store/zustand/live-title";

const state = vi.hoisted(() => ({
  generating: false,
  title: "Untitled" as string | undefined,
  beforeWrite: vi.fn(() => Promise.resolve()),
}));
vi.mock("usehooks-ts", () => ({ useResizeObserver: vi.fn() }));
vi.mock("~/ai/hooks", () => ({ useTitleGenerating: () => state.generating }));
vi.mock("~/session/queries", () => ({
  useSession: () => ({ title: state.title }),
}));
vi.mock("~/db", () => ({
  liveQueryClient: {
    execute: async () => [{ title: state.title ?? "", locked: 0 }],
  },
}));
vi.mock("~/session/content-mutations", () => ({
  applySessionContentCorrections: async ({
    title,
  }: {
    title: { currentTitle: string; nextTitle: string };
  }) => {
    await state.beforeWrite();
    if ((state.title ?? "") !== title.currentTitle)
      throw new Error("transaction statement 0 affected 0 rows; expected 1");
    state.title = title.nextTitle;
  },
}));

function Label() {
  const title = useSessionTitle("session-1", state.title);
  return <output aria-label="Sidebar title">{title}</output>;
}

const renderTitleInput = (
  props: Partial<ComponentProps<typeof TitleInput>> = {},
) =>
  render(
    <TooltipProvider>
      <Label />
      <TitleInput
        tab={{
          active: true,
          id: "session-1",
          pinned: false,
          slotId: "slot-1",
          state: { autoStart: null, view: null },
          type: "sessions",
        }}
        {...props}
      />
    </TooltipProvider>,
  );

beforeEach(() => {
  state.generating = false;
  state.title = "Untitled";
  state.beforeWrite.mockReset();
  state.beforeWrite.mockResolvedValue();
  useLiveTitle.setState({ titles: {} });
});
afterEach(cleanup);

describe("TitleInput", () => {
  it("shows the latest generated title and restores editing without reopening the note", () => {
    state.generating = true;
    const view = renderTitleInput();
    expect(screen.getByText("Generating title...")).toBeTruthy();
    state.title = "Generated meeting title";
    state.generating = false;
    view.rerender(
      <TooltipProvider>
        <TitleInput
          tab={{
            active: true,
            id: "session-1",
            pinned: false,
            slotId: "slot-1",
            state: { autoStart: null, view: null },
            type: "sessions",
          }}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("textbox", { name: "Session title" }),
    ).toHaveProperty("value", "Generated meeting title");
    expect(screen.queryByText("Generating title...")).toBeNull();
  });

  it("keeps a newer draft visible when an earlier blur saves and serializes the next save", async () => {
    let finishFirst = () => {};
    let finishSecond = () => {};
    state.beforeWrite
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishSecond = resolve;
        }),
      );
    renderTitleInput();
    const input = screen.getByRole("textbox", { name: "Session title" });
    fireEvent.change(input, { target: { value: "First title" } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: "Second title" } });
    fireEvent.blur(input);
    expect(screen.getByLabelText("Sidebar title").textContent).toBe(
      "Second title",
    );
    await act(async () => {
      finishFirst();
    });
    await waitFor(() => expect(state.title).toBe("First title"));
    expect(screen.getByLabelText("Sidebar title").textContent).toBe(
      "Second title",
    );
    await act(async () => {
      finishSecond();
    });
    await waitFor(() => expect(state.title).toBe("Second title"));
    expect(input).toHaveProperty("value", "Second title");
    expect(screen.getByLabelText("Sidebar title").textContent).toBe(
      "Second title",
    );
  });

  it("preserves Enter splitting into the note body and allows an empty title", async () => {
    const transfer = vi.fn();
    renderTitleInput({ onTransferContentToEditor: transfer });
    const input = screen.getByRole("textbox", { name: "Session title" });
    fireEvent.change(input, { target: { value: "Title body" } });
    if (!(input instanceof HTMLInputElement))
      throw new Error("Missing title input");
    input.setSelectionRange(5, 5);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(state.title).toBe("Title"));
    await waitFor(() => expect(transfer).toHaveBeenCalledWith(" body"));
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    await waitFor(() => expect(state.title).toBe(""));
    expect(input.value).toBe("");
  });

  it("does not submit an IME confirmation or route Escape into navigation", () => {
    const transfer = vi.fn();
    renderTitleInput({ onTransferContentToEditor: transfer });
    const input = screen.getByRole("textbox", { name: "Session title" });
    fireEvent.change(input, { target: { value: "안" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(state.title).toBe("Untitled");
    expect(input).toHaveProperty("value", "안");
    expect(transfer).not.toHaveBeenCalled();
  });

  it("shows a persisted title that arrives after mounting", () => {
    state.title = undefined;
    const view = renderTitleInput();
    expect(
      screen.getByRole("textbox", { name: "Session title" }),
    ).toHaveProperty("value", "");
    state.title = "Loaded note";
    view.rerender(
      <TooltipProvider>
        <TitleInput
          tab={{
            active: true,
            id: "session-1",
            pinned: false,
            slotId: "slot-1",
            state: { autoStart: null, view: null },
            type: "sessions",
          }}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole("textbox", { name: "Session title" }),
    ).toHaveProperty("value", "Loaded note");
  });
});
