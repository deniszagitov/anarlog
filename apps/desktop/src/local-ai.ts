import { useBillingAccess } from "~/auth/billing-context";

export function isLocalAiBuild() {
  return import.meta.env.VITE_LOCAL_AI === "true";
}

export function isLocalInferenceEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isInferenceEndpoint(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isAllowedInferenceEndpoint(value: string, provider: string) {
  return provider === "custom"
    ? isInferenceEndpoint(value)
    : isLocalInferenceEndpoint(value);
}

export function useLocalFeatureAccess(localOperation = true) {
  const billing = useBillingAccess();
  const localAccess = localOperation && isLocalAiBuild();

  return {
    allowed: localAccess || billing.isPro,
    isReady: localAccess || billing.isReady,
  };
}
