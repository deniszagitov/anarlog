import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { RecordingImportWorker } from "./recording-import";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
  transcribe: vi.fn(),
  summarize: vi.fn(),
  activeTranscriptions: [] as object[],
  billingReady: true,
  connectionReady: true,
  authSession: {} as object | null,
}));
vi.mock("@anlg/plugin-db", () => ({
  cleanupRecordingImports: async () => {},
}));
vi.mock("@anlg/plugin-transcription", () => ({
  commands: {
    listTranscriptionSessions: async () => ({
      status: "ok",
      data: mocks.activeTranscriptions,
    }),
  },
}));
vi.mock("@anlg/plugin-settings", () => ({
  commands: { vaultBase: async () => ({ status: "ok", data: "/vault" }) },
}));
vi.mock("~/settings/queries", () => ({ useSettingsReady: () => true }));
vi.mock("~/settings/providers", () => ({
  useAiProvidersState: () => ({ isReady: true }),
}));
vi.mock("~/auth/billing-context", () => ({
  useBillingAccess: () => ({ isReady: mocks.billingReady }),
}));
vi.mock("~/auth", () => ({
  useAuth: () => ({ session: mocks.authSession }),
}));
vi.mock("~/db", () => ({
  liveQueryClient: { execute: mocks.execute },
  executeTransaction: mocks.transaction,
}));
vi.mock("@anlg/plugin-fs-sync", () => ({
  commands: {
    audioImport: async (_id: string, source: string) => {
      if (!source)
        throw new Error("Original audio must not be imported over itself");
      return { status: "ok", data: "/audio.wav" };
    },
    audioPath: async () => ({ status: "ok", data: "/audio.wav" }),
  },
}));
vi.mock("@anlg/plugin-fs2", () => ({
  commands: { remove: async () => ({ status: "ok" }) },
}));
vi.mock("~/db/cloudsync-activity", () => ({
  withCloudsyncActivity: (_kind: string, _id: string, run: () => unknown) =>
    run(),
}));
vi.mock("~/session/attachments", () => ({
  catalogLocalSessionAudio: async () => {},
}));
vi.mock("~/session/queries", () => ({ useSession: () => ({ id: "meeting" }) }));
vi.mock("~/stt/useRunBatch", () => ({ useRunBatch: () => mocks.transcribe }));
vi.mock("~/stt/useSTTConnection", () => ({
  useSTTConnection: () => ({ isReady: mocks.connectionReady }),
}));
vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => ({ enhanceAndWait: mocks.summarize }),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
  mocks.connectionReady = true;
  mocks.activeTranscriptions = [];
});

function setupJob(fails: boolean, inPlace = false) {
  let status = "queued";
  let summaryStatus = "pending";
  let error: string | null = null;
  let finish: (() => void) | undefined;
  const summary = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const audio = new Map([["/audio.wav", "original recording"]]);
  const transcript: string[] = [];
  mocks.transcribe.mockImplementation(async (path, options) => {
    if (!options.preserveAudio) audio.delete(path);
    transcript.push("Saved transcript");
  });
  mocks.summarize.mockImplementation(async () => {
    await summary;
    if (fails) throw new Error("provider-secret-must-not-leak");
    return "done";
  });
  mocks.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("RETURNING id")) {
      if (status !== "queued") return [];
      status = "importing";
      return [{ id: "job" }];
    }
    if (sql.includes("file_path != ''")) return [];
    if (sql.includes("AS has_transcript"))
      return [{ has_transcript: transcript.length > 0 ? 1 : 0 }];
    return ["done", "failed"].includes(status)
      ? []
      : [
          {
            id: "job",
            meeting_id: "meeting",
            file_path: inPlace ? "" : "/staged.wav",
          },
        ];
  });
  mocks.transaction.mockImplementation(
    async (statements: { params: unknown[] }[]) => {
      for (const statement of statements) {
        if (statement.params.length === 5) {
          [status, summaryStatus, error] = statement.params as [
            string,
            string,
            string | null,
            string,
            string,
          ];
        }
      }
    },
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <RecordingImportWorker />
      </QueryClientProvider>
    </StrictMode>,
  );
  return {
    client,
    view,
    finishSummary: () => finish?.(),
    state: () => ({
      status,
      summaryStatus,
      error,
      audio: audio.get("/audio.wav"),
      transcript,
    }),
  };
}

it.each([false, true])(
  "survives StrictMode and waits for the summary outcome (failure: %s)",
  async (fails) => {
    vi.useFakeTimers();
    mocks.billingReady = true;
    mocks.authSession = {};
    const job = setupJob(fails);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(job.state().status).toBe("summarizing");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(job.state().status).toBe("summarizing");
    await act(async () => {
      job.finishSummary();
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(job.state().status).toBe(fails ? "failed" : "done");
    expect(job.state().summaryStatus).toBe(fails ? "failed" : "done");
    expect(job.state().error ?? "").not.toContain("provider-secret");
    job.client.clear();
  },
);

it("runs signed-out imports and finishes them after the worker unmounts", async () => {
  vi.useFakeTimers();
  mocks.billingReady = false;
  mocks.authSession = null;
  const job = setupJob(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("summarizing");
  job.view.unmount();
  await act(async () => {
    job.finishSummary();
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("done");
  job.client.clear();
});

it("keeps an import queued until its transcription connection is ready", async () => {
  vi.useFakeTimers();
  mocks.billingReady = false;
  mocks.authSession = null;
  mocks.connectionReady = false;
  const job = setupJob(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("queued");

  mocks.connectionReady = true;
  job.view.rerender(
    <StrictMode>
      <QueryClientProvider client={job.client}>
        <RecordingImportWorker />
      </QueryClientProvider>
    </StrictMode>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
    job.finishSummary();
    await vi.advanceTimersByTimeAsync(100);
  });
  expect(job.state().status).toBe("done");
  job.client.clear();
});
it.each([false, true])(
  "preserves existing audio and refuses overlapping native transcription (busy: %s)",
  async (busy) => {
    vi.useFakeTimers();
    mocks.billingReady = true;
    mocks.authSession = null;
    mocks.activeTranscriptions = busy ? [{ session_id: "meeting" }] : [];
    const job = setupJob(false, true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(job.state()).toMatchObject({
      status: busy ? "failed" : "done",
      summaryStatus: busy ? "pending" : "skipped_transcription_only",
      audio: "original recording",
      transcript: busy ? [] : ["Saved transcript"],
    });
    if (busy)
      expect(job.state().error).toContain("No new transcription was started");
    job.client.clear();
  },
);
