import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { isInferenceEndpoint, isLocalAiBuild } from "~/local-ai";

export const providerFetch: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (isLocalAiBuild()) {
    if (!isInferenceEndpoint(url.toString())) {
      throw new Error(
        "Enter an HTTP or HTTPS inference endpoint without embedded credentials.",
      );
    }
  }
  const requestInit: Parameters<typeof tauriFetch>[1] = isLocalAiBuild()
    ? { ...init, redirect: "error", maxRedirections: 0 }
    : init;
  if (
    (url.protocol === "http:" || url.protocol === "https:") &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  ) {
    const headers = new Headers(
      requestInit?.headers ??
        (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("Origin")) {
      // Tauri's unsafe-headers transport removes an empty Origin instead of
      // injecting the webview origin, which local servers can reject.
      headers.set("Origin", "");
      return tauriFetch(input, { ...requestInit, headers });
    }
  }

  return tauriFetch(input, requestInit);
};
