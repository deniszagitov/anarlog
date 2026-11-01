import { t } from "@lingui/core/macro";

import { commands } from "@anlg/plugin-notification";

export function showLocalizedNotification(
  notification: Omit<
    Parameters<typeof commands.showNotification>[0],
    "ui_labels"
  >,
) {
  const minutes = "{minutes}";
  const time = "{time}";
  const seconds = "{seconds}";
  return commands.showNotification({
    ...notification,
    ui_labels: {
      Accept: t`Accept`,
      Options: t`Options`,
      "Open Anarlog": t`Open Anarlog`,
      "Open meeting": t`Open meeting`,
      Close: t`Close`,
      Stop: t`Stop`,
      "Show less": t`Show less`,
      "Starting soon": t`Starting soon`,
      Started: t`Started`,
      "Starting in {minutes} min": t`Starting in ${minutes} min`,
      "Begins in {time}": t`Begins in ${time}`,
      "Anarlog will stop listening in {seconds} s.": t`Anarlog will stop listening in ${seconds} s.`,
    },
  });
}
