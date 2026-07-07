"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PushNotificationSetup } from "@/components/push-notification-setup";

type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
};

const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Аналитика", shortLabel: "Аналитика" },
  { href: "/dashboard/appeals", label: "Обращения", shortLabel: "Обращения" },
  { href: "/dashboard/appeals-report", label: "Отчёт IT", shortLabel: "IT" },
  { href: "/dashboard/courier-report", label: "Отчёт курьерское приложение", shortLabel: "Курьеры" },
];

const moreNav: NavItem[] = [
  { href: "/dashboard/employees", label: "База сотрудников", shortLabel: "Сотрудники" },
  { href: "/dashboard/points", label: "Точки", shortLabel: "Точки" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export function DashboardMobileShell({
  userEmail,
  children,
}: {
  userEmail?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreNav.some((item) => isActive(pathname, item.href));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] md:grid md:max-w-none md:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-zinc-800 bg-zinc-950 p-4 md:block">
          <div className="text-sm font-medium text-zinc-300">Фуджи · мониторинг</div>
          <nav className="mt-6 flex flex-col gap-1">
            {[...primaryNav, ...moreNav].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive(pathname, item.href)
                    ? "rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white"
                    : "rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 hover:text-white"
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 space-y-3">
            <PushNotificationSetup compact />
            <div className="truncate text-xs text-zinc-600">{userEmail}</div>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {primaryNav.find((item) => isActive(pathname, item.href))?.label ??
                    moreNav.find((item) => isActive(pathname, item.href))?.label ??
                    "Фуджи · мониторинг"}
                </p>
                <p className="truncate text-xs text-zinc-500">{userEmail}</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen((value) => !value)}
                className={
                  moreOpen || moreActive
                    ? "rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100"
                    : "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                }
              >
                Ещё
              </button>
            </div>
            {moreOpen ? (
              <div className="mt-3 space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3">
                {moreNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    {item.label}
                  </Link>
                ))}
                <PushNotificationSetup compact />
              </div>
            ) : null}
          </header>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur md:hidden safe-bottom">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-2 py-2">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive(pathname, item.href)
                  ? "rounded-xl bg-zinc-900 px-2 py-2 text-center text-[11px] font-medium text-white"
                  : "rounded-xl px-2 py-2 text-center text-[11px] text-zinc-400"
              }
            >
              {item.shortLabel}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
