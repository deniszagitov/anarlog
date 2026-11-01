import { t } from "@lingui/core/macro";

import type { DegradedError } from "@anlg/plugin-transcription";

import { PROVIDERS } from "~/settings/ai/stt/shared";

const LOCAL_PROVIDER_IDS = new Set(["soniqo", "apple_speech", "local_file"]);

function providerDisplayName(providerId: string | null | undefined) {
  if (!providerId) return null;
  return (
    PROVIDERS.find((provider) => provider.id === providerId)?.displayName ??
    null
  );
}

function isProviderSideStreamError(message: string) {
  return (
    /provider error/i.test(message) ||
    /code=Some\(4\d{3}\)/.test(message) ||
    /^[\w-]+: /.test(message)
  );
}

function getPauseCause({
  degraded,
  sttProvider,
  online,
}: {
  degraded: DegradedError | null;
  sttProvider: string | null | undefined;
  online: boolean;
}) {
  const isCloud = sttProvider === "anarlog";
  const providerName = isCloud
    ? "Anarlog"
    : (providerDisplayName(sttProvider) ?? t`the transcription service`);

  const isLocal = !!sttProvider && LOCAL_PROVIDER_IDS.has(sttProvider);

  if (!online && !isLocal) {
    return t`you're offline`;
  }

  if (degraded?.type === "authentication_failed") {
    return isCloud
      ? t`Anarlog couldn't verify your account`
      : t`${providerName} rejected your API key`;
  }

  if (degraded?.type === "provider_configuration") {
    return isCloud
      ? t`our speech-to-text provider rejected the request`
      : t`${providerName} rejected the transcription settings`;
  }

  if (
    degraded?.type === "stream_error" &&
    isProviderSideStreamError(degraded.message)
  ) {
    return isCloud
      ? t`our speech-to-text provider is having an outage`
      : t`${providerName} is having an outage`;
  }

  if (degraded) {
    if (isCloud) {
      return t`Anarlog's transcription server is having issues`;
    }
    if (sttProvider && LOCAL_PROVIDER_IDS.has(sttProvider)) {
      return t`the local transcription model stopped responding`;
    }
    return t`Anarlog can't reach ${providerName}`;
  }

  return isCloud
    ? t`Anarlog's transcription server stopped sending words`
    : t`${providerName} stopped sending words`;
}

export function getLiveTranscriptPausedMessage({
  degraded,
  sttProvider,
  online = typeof navigator === "undefined" ? true : navigator.onLine,
}: {
  degraded: DegradedError | null;
  sttProvider: string | null | undefined;
  online?: boolean;
}) {
  const cause = getPauseCause({ degraded, sttProvider, online });
  const savedAudioNote = t`Your audio is still being saved, and the missing part will be filled in from the recording.`;
  return t`Live transcript paused because ${cause}. ${savedAudioNote}`;
}
