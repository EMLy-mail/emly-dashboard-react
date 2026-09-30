import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/login-form";
import { getOidcConfig } from "@/lib/oidc";

const SSO_ERRORS = ["ssoUnavailable", "ssoDenied", "ssoForbidden", "ssoConflict", "ssoFailed"] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("login");
  const { error } = await searchParams;
  const known = SSO_ERRORS.find((e) => e === error);

  return <LoginForm ssoEnabled={getOidcConfig() !== null} error={known ? t(`errors.${known}`) : undefined} />;
}
