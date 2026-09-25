"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Bug, Users, PackageOpen, BarChart3, SlidersHorizontal, Ban, KeyRound, LogOut, Sun, Moon, Menu, X, MonitorSmartphone, TerminalSquare, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import type { AuthUser } from "@/lib/api";
import { isAdminRole } from "@/lib/roles";

export function Sidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const t = useTranslations("sidebar");
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const closePasswordDialog = useCallback(() => setPasswordOpen(false), []);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close the mobile drawer on navigation (covers back/forward, not just link clicks).
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Prevent the page behind the drawer from scrolling while it's open on mobile.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const navItems = [
    { href: "/bug-reports", label: t("nav.bugReports"), icon: Bug },
    { href: "/users", label: t("nav.users"), icon: Users },
    { href: "/updates", label: t("nav.updates"), icon: PackageOpen },
    { href: "/clients", label: t("nav.clients"), icon: MonitorSmartphone },
    ...(user.role === "admin"
      ? [{ href: "/remote", label: t("nav.remote"), icon: TerminalSquare }]
      : []),
    { href: "/statistics", label: t("nav.statistics"), icon: BarChart3 },
    { href: "/config", label: t("nav.config"), icon: SlidersHorizontal },
    { href: "/bans", label: t("nav.bans"), icon: Ban },
  ];

  const initials = (user.displayname || user.username)
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center gap-2 border-b bg-background p-3 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label={t("openMenu")}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Image src="/aryx-logo.png" alt="" width={24} height={24} className="h-6 w-6 dark:invert" />
          <h2 className="text-base font-semibold tracking-tight">{t("title")}</h2>
        </div>
      </div>

      {/* Backdrop, mobile only, shown while the drawer is open */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer on mobile, static column on md+ */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-background transition-transform duration-200 ease-in-out md:static md:z-auto md:w-60 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2.5">
            <Image src="/aryx-logo.png" alt="" width={32} height={32} className="h-8 w-8 dark:invert" />
            <h2 className="text-lg font-semibold tracking-tight">{t("title")}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen(false)}
            aria-label={t("closeMenu")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Separator />
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {navGroups.map((group) => {
            const collapsed = group.label !== null && !!collapsedGroups[group.key];
            return (
              <div key={group.key} className="space-y-1">
                {group.label && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-expanded={!collapsed}
                    className="flex w-full items-center justify-between rounded-md px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      {group.logo && (
                        <Image src={group.logo} alt="" width={16} height={16} className="h-4 w-4 dark:invert" />
                      )}
                      {group.label}
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                    />
                  </button>
                )}
                {!collapsed &&
                  group.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    );
                  })}
              </div>
            );
          })}
        </nav>
        <Separator />
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user.displayname || user.username}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setPasswordOpen(true)}
              aria-label={t("changePassword")}
              title={t("changePassword")}
            >
              <KeyRound className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="relative shrink-0 px-2"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={t("toggleTheme")}
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
            </Button>
            <LanguageSwitcher />
            <form action={logoutAction} className="flex-1">
              <Button variant="outline" size="sm" className="w-full" type="submit">
                <LogOut className="mr-2 h-4 w-4" />
                {t("signOut")}
              </Button>
            </form>
          </div>
        </div>
      </div>

      <ChangePasswordDialog open={passwordOpen} onClose={closePasswordDialog} />
    </>
  );
}
