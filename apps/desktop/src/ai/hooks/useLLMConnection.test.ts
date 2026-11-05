import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { renderHook } from "@testing-library/react";
import { generateText, Output, streamText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { normalizeLLMProviderId, useLanguageModel } from "./useLLMConnection";

const mocks = vi.hoisted(() => ({
  provider: "custom" as string,
  baseUrl: "http://127.0.0.1:8000/v1",
}));
const managed = vi.hoisted(() => ({ ready: true, disabled: false }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("~/settings/queries", () => ({
  useSettingsReady: () => managed.ready,
}));
vi.mock("~/auth", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("~/auth/billing-context", () => ({
  useBillingAccess: () => ({ isPaid: false }),
}));
vi.mock("~/settings/providers", () => ({
  useAiProvider: () => ({
    type: "llm",
    base_url: mocks.baseUrl,
    api_key: "local-key",
  }),
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => ({
    intelligence_disabled: managed.disabled,
    current_llm_provider: mocks.provider,
    current_llm_model: "mtplx",
    current_llm_reasoning_effort: "default",
  }),
}));

afterEach(() => {
  mocks.provider = "custom";
  mocks.baseUrl = "http://127.0.0.1:8000/v1";
  vi.unstubAllEnvs();
});

it("generates with a corporate Custom endpoint in the local build without a cloud account", async () => {
  vi.stubEnv("VITE_LOCAL_AI", "true");
  mocks.baseUrl = "https://inference.example.invalid/v1";
  vi.mocked(tauriFetch).mockImplementation(async (input, init) => {
    expect(String(input)).toBe(`${mocks.baseUrl}/chat/completions`);
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer local-key",
    );
    expect(JSON.parse(String(init?.body)).model).toBe("mtplx");
    return Response.json({
      id: "corporate-completion",
      model: "mtplx",
      created: 0,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Corporate summary" },
          finish_reason: "stop",
        },
      ],
    });
  });
  const { result, unmount } = renderHook(() => useLanguageModel());
  expect(result.current).not.toBeNull();
  const completion = await generateText({
    model: result.current!,
    prompt: "Summarize the meeting",
    maxRetries: 0,
  });
  expect(completion.text).toBe("Corporate summary");
  unmount();
});

it.each([false, true])(
  "generates through Custom with an origin-restricted local server (stream: %s)",
  async (stream) => {
    vi.mocked(tauriFetch).mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Origin") !== "")
        return new Response(null, { status: 403 });
      if (headers.get("Authorization") !== "Bearer local-key")
        return new Response(null, { status: 401 });
      expect(String(input)).toBe("http://127.0.0.1:8000/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("mtplx");
      if (body.stream) {
        const chunk = {
          id: "local-completion",
          model: "mtplx",
          created: 0,
          choices: [
            {
              index: 0,
              delta: { content: "Local summary" },
              finish_reason: "stop",
            },
          ],
        };
        return new Response(
          `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return Response.json({
        id: "local-completion",
        model: "mtplx",
        created: 0,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Local summary" },
            finish_reason: "stop",
          },
        ],
      });
    });

    const { result, unmount } = renderHook(() => useLanguageModel());
    expect(result.current).not.toBeNull();
    const options = {
      model: result.current!,
      prompt: "Summarize the meeting",
      maxRetries: 0,
    };
    const completion = stream
      ? streamText(options)
      : await generateText(options);
    expect(await completion.text).toBe("Local summary");
    unmount();
  },
);

it("sends OpenRouter app-attribution headers for the BYOK openrouter provider", async () => {
  mocks.provider = "openrouter";
  vi.mocked(tauriFetch).mockImplementation(async (input, init) => {
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    expect(headers.get("HTTP-Referer")).toBe("https://anarlog.so");
    expect(headers.get("X-OpenRouter-Title")).toBe("Anarlog");
    expect(headers.get("X-OpenRouter-Categories")).toBe(
      "writing-assistant,personal-agent",
    );
    return Response.json({
      id: "openrouter-completion",
      model: "mtplx",
      created: 0,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "Hello from OpenRouter" },
          finish_reason: "stop",
        },
      ],
    });
  });

  const { result, unmount } = renderHook(() => useLanguageModel());
  expect(result.current).not.toBeNull();
  const completion = await generateText({
    model: result.current!,
    prompt: "Summarize the meeting",
    maxRetries: 0,
  });
  expect(await completion.text).toBe("Hello from OpenRouter");
  unmount();
});

it("passes Ollama the JSON schema needed for validated meeting facts", async () => {
  mocks.provider = "ollama";
  vi.mocked(tauriFetch).mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    expect(body.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        schema: {
          type: "object",
          properties: { decision: { type: "string" } },
          required: ["decision"],
        },
      },
    });
    return Response.json({
      id: "local-facts",
      model: "mtplx",
      created: 0,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({ decision: "Release Friday" }),
          },
          finish_reason: "stop",
        },
      ],
    });
  });
  const { result, unmount } = renderHook(() => useLanguageModel());
  const completion = await generateText({
    model: result.current!,
    prompt: "Extract the decision from this synthetic meeting.",
    maxRetries: 0,
    output: Output.object({ schema: z.object({ decision: z.string() }) }),
  });
  expect(completion.output).toEqual({ decision: "Release Friday" });
  unmount();
});

describe("normalizeLLMProviderId", () => {
  it("maps the legacy hosted provider id and preserves current ids", () => {
    expect(normalizeLLMProviderId("hyprnote")).toBe("anarlog");
    expect(normalizeLLMProviderId("openai")).toBe("openai");
  });
});

it.each([
  { ready: true, disabled: true },
  { ready: false, disabled: false },
])(
  "constructs no model before settings load or while intelligence is managed off (%j)",
  (state) => {
    managed.ready = state.ready;
    managed.disabled = state.disabled;
    vi.mocked(tauriFetch).mockClear();
    try {
      const { result, unmount } = renderHook(() => useLanguageModel());
      expect(result.current).toBeNull();
      expect(tauriFetch).not.toHaveBeenCalled();
      unmount();
    } finally {
      managed.ready = true;
      managed.disabled = false;
    }
  },
);
