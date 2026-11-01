import { i18n as sourceI18n } from "@lingui/core";
import { I18nProvider, useLingui } from "@lingui/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";

import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { createI18n } from "./catalogs";
import { resolveDisplayLocale, SOURCE_LOCALE } from "./locales";
import { messages as sourceMessages } from "./locales/en/messages";

import { useConfigValue } from "~/shared/config";

// Startup errors can render before the database exposes the saved language.
sourceI18n.load(SOURCE_LOCALE, sourceMessages);
sourceI18n.activate(SOURCE_LOCALE);

export function SourceI18nProvider({ children }: { children: ReactNode }) {
  return <I18nProvider i18n={sourceI18n}>{children}</I18nProvider>;
}

export function AppI18nProvider({ children }: { children: ReactNode }) {
  const mainLanguage = useConfigValue("ai_language");
  const locale = resolveDisplayLocale(mainLanguage);
  const { data: i18n } = useQuery({
    queryKey: ["i18n-catalog", locale],
    queryFn: () => createI18n(locale),
    placeholderData: keepPreviousData,
    // Catalog files are cached separately; activation must run on every switch.
    staleTime: 0,
    refetchOnWindowFocus: false,
    gcTime: Number.POSITIVE_INFINITY,
  });

  if (!i18n) return null;

  return (
    <I18nProvider i18n={i18n}>
      <DocumentLanguage />
      {children}
    </I18nProvider>
  );
}

function DocumentLanguage() {
  const { i18n } = useLingui();
  return <DocumentLocale key={i18n.locale} locale={i18n.locale} />;
}

function DocumentLocale({ locale }: { locale: string }) {
  useMountEffect(() => {
    document.documentElement.lang = locale;
  });

  return null;
}
