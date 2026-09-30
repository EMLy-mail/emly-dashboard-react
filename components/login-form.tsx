"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { loginAction, type LoginActionState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const initialState: LoginActionState = {};

export function LoginForm({ ssoEnabled, error }: { ssoEnabled: boolean; error?: string }) {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const t = useTranslations("login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {(state.error || error) && (
              <Alert variant="destructive">
                <AlertDescription>{state.error ?? error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                name="username"
                type="text"
                required
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? t("signingIn") : t("signIn")}
            </Button>
          </form>
          {ssoEnabled && (
            <>
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" />
                {t("or")}
                <Separator className="flex-1" />
              </div>
              {/* A plain link: the flow starts with a redirect, not a fetch. */}
              <Button asChild variant="outline" className="w-full">
                <a href="/login/sso">{t("signInSso")}</a>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
