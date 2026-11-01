import { t } from "@lingui/core/macro";

export function nativeMenuMessages(): Record<string, string> {
  const app = "{app}";
  const version = "{version}";
  const error = "{error}";
  const commit = "{commit}";
  const count = "{count}";
  const duration = "{duration}";
  const hours = "{hours}";
  const minutes = "{minutes}";

  return {
    "About {app}": t`About ${app}`,
    "Open {app}": t`Open ${app}`,
    "Hide {app}": t`Hide ${app}`,
    "Quit {app} Completely?": t`Quit ${app} Completely?`,
    "{app} will stop running in the background.": t`${app} will stop running in the background.`,
    "App Name: {app}\nApp Version: {version}\nSHA: {commit}": t`App Name: ${app}\nApp Version: ${version}\nSHA: ${commit}`,
    "Update v{version} is available!": t`Update v${version} is available!`,
    "Failed to install update: {error}": t`Failed to install update: ${error}`,
    "Failed to download update: {error}": t`Failed to download update: ${error}`,
    "Failed to check for updates: {error}": t`Failed to check for updates: ${error}`,
    "{duration} left": t`${duration} left`,
    "in {duration}": t`in ${duration}`,
    "{count}s": t`${count}s`,
    "{count}m": t`${count}m`,
    "{count}h": t`${count}h`,
    "{hours}h {minutes}m": t`${hours}h ${minutes}m`,
    "New Note": t`New Note`,
    "Start a new meeting": t`Start a new meeting`,
    Hide: t`Hide`,
    Quit: t`Quit`,
    Settings: t`Settings`,
    "Quit Completely…": t`Quit Completely…`,
    "Quit Completely": t`Quit Completely`,
    "Show events in menu bar": t`Show events in menu bar`,
    "Report Bug": t`Report Bug`,
    "Suggest Feature": t`Suggest Feature`,
    File: t`File`,
    Edit: t`Edit`,
    View: t`View`,
    Window: t`Window`,
    Help: t`Help`,
    Services: t`Services`,
    "Hide Others": t`Hide Others`,
    "Show All": t`Show All`,
    "Close Window": t`Close Window`,
    Undo: t`Undo`,
    Redo: t`Redo`,
    Cut: t`Cut`,
    Copy: t`Copy`,
    Paste: t`Paste`,
    "Select All": t`Select All`,
    "Full Screen": t`Full Screen`,
    Minimize: t`Minimize`,
    Maximize: t`Maximize`,
    Cancel: t`Cancel`,
    Download: t`Download`,
    Later: t`Later`,
    "Check for Updates": t`Check for Updates`,
    "Downloading...": t`Downloading...`,
    "Restart to Apply Update": t`Restart to Apply Update`,
    "Update Failed": t`Update Failed`,
    "Update Available": t`Update Available`,
    "Update Check Failed": t`Update Check Failed`,
    "There are currently no updates available.": t`There are currently no updates available.`,
    Today: t`Today`,
    Tomorrow: t`Tomorrow`,
  };
}
