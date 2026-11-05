import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("~/ai/provider-fetch", () => ({ providerFetch: fetchMock }));
vi.mock("~/settings/providers", () => ({
  useAiProvidersState: () => ({
    providers: {
      "stt:custom": {
        base_url: "https://inference.example.invalid/v1",
        api_key: "ollama",
      },
    },
  }),
}));

import { LocalServerModel } from "./local-server-model";

afterEach(cleanup);

test("offers server model identifiers without cloud aliases and preserves a manual speech model", async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        data: [
          { id: "gemma4:e2b-mlx" },
          { id: "gemma4:cloud" },
          { id: null },
          { id: "local-chat", capabilities: ["completion"] },
        ],
      }),
    ),
  );
  const onChange = vi.fn();
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <LocalServerModel value="" onChange={onChange} />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("option", { hidden: true }).getAttribute("value"),
    ).toBe("gemma4:e2b-mlx"),
  );
  expect(fetchMock).toHaveBeenCalledWith(
    new URL("https://inference.example.invalid/v1/models"),
    expect.objectContaining({ headers: { Authorization: "Bearer ollama" } }),
  );
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "local-asr" },
  });
  expect(onChange).toHaveBeenCalledWith("local-asr");
});
