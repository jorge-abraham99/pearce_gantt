"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Schedule", href: "/schedule", prefix: "/schedule" },
  { label: "Staff", href: "/admin/workers", prefix: "/admin/workers" },
  { label: "Availability", href: "/availability", prefix: "/availability" },
  { label: "Balers", href: "/admin/balers", prefix: "/admin/balers" },
];

export default function AppNav() {
  const pathname = usePathname();

  function isActive(prefix: string) {
    if (prefix === "/schedule") return pathname === "/" || pathname.startsWith("/schedule");
    return pathname.startsWith(prefix);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--panel)]/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[120rem] items-center gap-6 px-4 py-3 md:px-6">
        {/* Brand */}
        <div className="flex flex-col leading-none">
          <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--accent)]">
            Pearce
          </span>
          <span className="font-display text-base font-semibold text-[var(--ink)]">
            Planner
          </span>
        </div>

        {/* Tabs */}
        <nav
          className="flex items-center gap-1"
          aria-label="Primary navigation"
        >
          {TABS.map((tab) => {
            const active = isActive(tab.prefix);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--ink)] text-white"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
