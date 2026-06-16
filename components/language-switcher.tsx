"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("sidebar");

  function toggle() {
    const next = locale === "en" ? "it" : "en";
    document.cookie = `locale=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="shrink-0 px-2 font-mono text-xs"
      onClick={toggle}
      aria-label={t("toggleLanguage")}
    >
      {locale.toUpperCase()}
    </Button>
  );
}
