import { setupI18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { I18nProvider } from "@lingui/react";
import {
  act,
  cleanup,
  fireEvent,
  render as renderView,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Listening } from "./listening";

vi.unmock("@lingui/react");

const displayI18n = setupI18n({
  locale: "en",
  messages: {
    en: {},
    ru: {
      [msg`Start listening`.id]: "Начать запись",
      [msg`Resume listening`.id]: "Возобновить запись",
    },
  },
});

function render(ui: React.ReactNode) {
  return renderView(ui, {
    wrapper: ({ children }) => (
      <I18nProvider i18n={displayI18n}>{children}</I18nProvider>
    ),
  });
}

const {
  isMainWebviewWindowMock,
  requestMainListenerControlMock,
  startListeningMock,
  stopMock,
  useListenerMock,
} = vi.hoisted(() => ({
  isMainWebviewWindowMock: vi.fn(() => true),
  requestMainListenerControlMock: vi.fn(),
  startListeningMock: vi.fn(),
  stopMock: vi.fn(),
  useListenerMock: vi.fn(),
}));

vi.mock("@anlg/ui/components/ui/dropdown-menu", () => ({
  DropdownMenuItem: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: useListenerMock,
}));

vi.mock("~/stt/useStartListeningWithBatchOverride", () => ({
  useStartListeningWithBatchOverride: () => startListeningMock,
}));

vi.mock("~/stt/window-control", () => ({
  isMainWebviewWindow: isMainWebviewWindowMock,
  requestMainListenerControl: requestMainListenerControlMock,
}));

describe("Listening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    displayI18n.activate("en");
    isMainWebviewWindowMock.mockReturnValue(true);
    useListenerMock.mockImplementation((selector) =>
      selector({
        getSessionMode: () => "inactive",
        stop: stopMock,
      }),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("updates idle listening actions when the display locale changes", () => {
    const view = render(<Listening sessionId="session-1" resume={false} />);

    act(() => displayI18n.activate("ru"));
    expect(screen.getByRole("button", { name: "Начать запись" })).toBeTruthy();

    view.rerender(<Listening sessionId="session-1" resume />);
    expect(
      screen.getByRole("button", { name: "Возобновить запись" }),
    ).toBeTruthy();

    act(() => displayI18n.activate("en"));
    expect(
      screen.getByRole("button", { name: "Resume listening" }),
    ).toBeTruthy();
  });

  it("resumes listening when the session already has content", () => {
    render(<Listening sessionId="session-1" resume />);

    fireEvent.click(screen.getByRole("button", { name: "Resume listening" }));

    expect(startListeningMock).toHaveBeenCalledTimes(1);
  });

  it("starts listening directly in the main window before transcript exists", () => {
    render(<Listening sessionId="session-1" resume={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));

    expect(startListeningMock).toHaveBeenCalledTimes(1);
    expect(requestMainListenerControlMock).not.toHaveBeenCalled();
  });

  it("lets users interrupt batch processing to resume listening", () => {
    useListenerMock.mockImplementation((selector) =>
      selector({
        getSessionMode: () => "running_batch",
        stop: stopMock,
      }),
    );

    render(<Listening sessionId="session-1" resume />);

    const resumeButton = screen.getByRole("button", {
      name: "Resume listening",
    });
    expect(resumeButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(resumeButton);

    expect(startListeningMock).toHaveBeenCalledTimes(1);
  });

  it("delegates standalone start requests to the main window before transcript exists", () => {
    isMainWebviewWindowMock.mockReturnValue(false);

    render(<Listening sessionId="session-1" resume={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Start listening" }));

    expect(requestMainListenerControlMock).toHaveBeenCalledWith(
      "start",
      "session-1",
    );
    expect(startListeningMock).not.toHaveBeenCalled();
  });

  it("delegates standalone stop requests to the main window", () => {
    isMainWebviewWindowMock.mockReturnValue(false);
    useListenerMock.mockImplementation((selector) =>
      selector({
        getSessionMode: () => "active",
        stop: stopMock,
      }),
    );

    render(<Listening sessionId="session-1" resume />);

    fireEvent.click(screen.getByRole("button", { name: "Stop listening" }));

    expect(requestMainListenerControlMock).toHaveBeenCalledWith(
      "stop",
      "session-1",
    );
    expect(stopMock).not.toHaveBeenCalled();
  });

  it("delegates batch overrides from standalone windows", () => {
    isMainWebviewWindowMock.mockReturnValue(false);
    useListenerMock.mockImplementation((selector) =>
      selector({
        getSessionMode: () => "running_batch",
        stop: stopMock,
      }),
    );

    render(<Listening sessionId="session-1" resume />);

    fireEvent.click(screen.getByRole("button", { name: "Resume listening" }));

    expect(requestMainListenerControlMock).toHaveBeenCalledWith(
      "start",
      "session-1",
    );
    expect(startListeningMock).not.toHaveBeenCalled();
  });
});
