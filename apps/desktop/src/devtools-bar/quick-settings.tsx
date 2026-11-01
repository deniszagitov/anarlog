import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui as useLocalizedUi } from "@lingui/react/macro";

import {
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@anlg/ui/components/ui/dropdown-menu";

import { MenuGroup, MenuHint } from "./menu";

import { useSetSettingValues } from "~/settings/queries";
import type { SettingKey, SettingValues } from "~/settings/schema";
import { useConfigValues } from "~/shared/config";

/**
 * Settings that change what is on screen, exposed as one-click toggles so a
 * build can be checked in both states without leaving the current view. This
 * is the closest thing Anarlog has to Linear's feature-flag tiles.
 */
const QUICK_TOGGLES = [
  {
    key: "floating_bar_enabled",
    label: msg`Floating bar`,
    description: msg`Show the floating recording bar while a meeting is active.`,
  },
  {
    key: "sidebar_show_folder",
    label: msg`Sidebar folders`,
    description: msg`Show the Folders section in the sidebar.`,
  },
  {
    key: "sidebar_show_tags",
    label: msg`Sidebar tags`,
    description: msg`Show the Tags section in the sidebar.`,
  },
  {
    key: "show_tray_icon",
    label: msg`Tray icon`,
    description: msg`Show the menu bar / system tray icon.`,
  },
  {
    key: "show_app_in_dock",
    label: msg`Dock icon`,
    description: msg`Keep the app icon in the Dock while running (macOS).`,
  },
  {
    key: "notification_event",
    label: msg`Event notifications`,
    description: msg`Notify before a calendar event starts.`,
  },
  {
    key: "notification_detect",
    label: msg`Meeting detection notifications`,
    description: msg`Notify when a meeting app starts using the microphone.`,
  },
] as const satisfies ReadonlyArray<{
  key: SettingKey;
  label: MessageDescriptor;
  description: MessageDescriptor;
}>;

const THEMES = [
  {
    value: "system",
    label: msg`System`,
    description: msg`Follow the OS appearance.`,
  },
  {
    value: "light",
    label: msg`Light`,
    description: msg`Always use the light theme.`,
  },
  {
    value: "dark",
    label: msg`Dark`,
    description: msg`Always use the dark theme.`,
  },
] as const;

const QUICK_KEYS = [...QUICK_TOGGLES.map(({ key }) => key), "theme"] as const;

// Rendered inside the dropdown so its settings subscription only lives while
// the menu is open.
export function QuickSettingsMenu() {
  const { t: translate, i18n } = useLocalizedUi();

  const values = useConfigValues(QUICK_KEYS);
  const setValues = useSetSettingValues();

  return (
    <>
      <MenuGroup
        label={translate`Theme`}
        description={translate`Switch the app theme without opening Settings.`}
        className="w-44"
      >
        <DropdownMenuRadioGroup
          value={values.theme}
          onValueChange={(theme) => setValues({ theme })}
        >
          {THEMES.map((theme) => (
            <MenuHint key={theme.value} description={i18n._(theme.description)}>
              <DropdownMenuRadioItem
                value={theme.value}
                onSelect={(event) => event.preventDefault()}
              >
                {i18n._(theme.label)}
              </DropdownMenuRadioItem>
            </MenuHint>
          ))}
        </DropdownMenuRadioGroup>
      </MenuGroup>
      <MenuGroup
        label={translate`Toggles`}
        description={translate`Flip display-affecting settings in place to compare both states.`}
        className="w-64"
      >
        {QUICK_TOGGLES.map(({ key, label, description }) => (
          <MenuHint key={key} description={i18n._(description)}>
            <DropdownMenuCheckboxItem
              checked={Boolean(values[key])}
              onCheckedChange={(checked) =>
                setValues({ [key]: checked === true } as SettingValues)
              }
              onSelect={(event) => event.preventDefault()}
            >
              {i18n._(label)}
            </DropdownMenuCheckboxItem>
          </MenuHint>
        ))}
      </MenuGroup>
    </>
  );
}
