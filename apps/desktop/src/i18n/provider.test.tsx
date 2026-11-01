import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AppI18nProvider, SourceI18nProvider } from "./provider";

import { BrandLoadingView } from "~/shared/brand-loading-view";

const settings = vi.hoisted(() => ({ language: "ru" }));
vi.unmock("@lingui/react");
vi.mock("~/shared/config", () => ({
  useConfigValue: () => settings.language,
}));

afterEach(cleanup);

function Locale() {
  const { i18n } = useLingui();
  return (
    <>
      <output aria-label="Display locale">{i18n.locale}</output>
      <p>{i18n._(msg`Settings`)}</p>
    </>
  );
}

it("provides translated startup UI before database settings are available", () => {
  render(
    <SourceI18nProvider>
      <BrandLoadingView />
    </SourceI18nProvider>,
  );
  expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
});

it("reactivates a previously visited language without reopening the app", async () => {
  const client = new QueryClient();
  const app = () => (
    <QueryClientProvider client={client}>
      <AppI18nProvider>
        <Locale />
      </AppI18nProvider>
    </QueryClientProvider>
  );
  const view = render(app());

  for (const [language, label] of [
    ["ru", "Настройки"],
    ["en", "Settings"],
    ["ru", "Настройки"],
  ]) {
    settings.language = language;
    view.rerender(app());
    await waitFor(() => {
      expect(screen.getByLabelText("Display locale").textContent).toBe(
        language,
      );
      expect(document.documentElement.lang).toBe(language);
      expect(screen.getByText(label)).toBeTruthy();
    });
  }
  client.clear();
});
