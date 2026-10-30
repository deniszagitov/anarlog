import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { useId } from "react";

import { providerCredentialIdentity } from "@anlg/provider-validation";
import { Input } from "@anlg/ui/components/ui/input";

import { providerFetch } from "~/ai/provider-fetch";
import { isLocalInferenceEndpoint } from "~/local-ai";
import { useAiProvidersState } from "~/settings/providers";

export function LocalServerModel({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const { t } = useLingui();
  const listId = useId();
  const { providers } = useAiProvidersState("stt");
  const config = providers["stt:custom"];
  const baseUrl = config?.base_url?.trim() || "http://127.0.0.1:11434/v1";
  const apiKey = config?.api_key?.trim() || "ollama";
  const models = useQuery({
    queryKey: [
      "local-asr-models",
      providerCredentialIdentity({
        provider: "custom",
        type: "stt",
        baseUrl,
        apiKey,
      }),
    ],
    enabled: isLocalInferenceEndpoint(baseUrl),
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const url = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
      url.pathname = `${url.pathname.replace(/\/$/, "")}/models`;
      const response = await providerFetch(url, {
        signal,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error("local_asr_models_unavailable");
      const data: { data?: { id?: unknown; capabilities?: unknown }[] } =
        await response.json();
      return (Array.isArray(data.data) ? data.data : []).flatMap((model) =>
        typeof model?.id === "string" &&
        !model.id.includes(":cloud") &&
        (!Array.isArray(model.capabilities) ||
          model.capabilities.includes("audio"))
          ? [model.id]
          : [],
      );
    },
  });

  return (
    <div className="flex min-w-0 flex-3 flex-col gap-1">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        className="text-xs"
        placeholder={t`Enter a model identifier`}
      />
      <datalist id={listId}>
        {(models.data ?? []).map((model) => (
          <option key={model} value={model} />
        ))}
      </datalist>
      {models.isError && (
        <span role="alert" className="text-destructive text-xs">
          {t`Could not load models`}
        </span>
      )}
    </div>
  );
}
