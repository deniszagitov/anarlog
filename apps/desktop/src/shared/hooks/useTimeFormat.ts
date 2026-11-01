import { useLingui } from "@lingui/react";

import { useConfigValue } from "~/shared/config";

export function useTimeFormat() {
  useLingui();
  return useConfigValue("use_24_hour_time") ? "HH:mm" : "h:mm a";
}
