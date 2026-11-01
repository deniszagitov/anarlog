import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ReactNode } from "react";

export type TodoProvider = {
  id: string;
  displayName: string;
  icon: ReactNode;
  nangoIntegrationId?: string;
  filterLabel?: MessageDescriptor;
  filterDescription?: MessageDescriptor;
  filterPlaceholder?: MessageDescriptor;
  permission?: "reminders";
  platform?: "macos" | "all";
};

export const TODO_PROVIDERS: TodoProvider[] = [
  {
    id: "github",
    displayName: "GitHub",
    icon: <img src="/assets/github-icon.svg" alt="GitHub" className="size-5" />,
    nangoIntegrationId: "github",
    filterLabel: msg`Repository`,
    filterDescription: msg`Only sync items from this repository.`,
    filterPlaceholder: msg`e.g. owner/repo`,
    platform: "all",
  },
  {
    id: "apple-reminders",
    displayName: "Apple Reminders",
    icon: (
      <img
        src="/assets/apple-reminders.png"
        alt="Apple Reminders"
        className="size-5 rounded-[4px] object-cover"
      />
    ),
    permission: "reminders",
    platform: "macos",
  },
];
