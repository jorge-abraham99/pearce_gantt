import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[120rem] flex-col gap-4 px-4 py-4 md:px-6">
      <nav className="flex items-center gap-3">
        <Link
          href="/schedule"
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)] transition hover:text-[var(--ink)]"
        >
          <svg
            aria-hidden
            className="h-3 w-3"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M8 2 L4 6 L8 10" />
          </svg>
          Planner
        </Link>
        <span className="text-[var(--line)]">/</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
          Admin
        </span>
        <Link
          href="/admin/workers"
          className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)] transition hover:text-[var(--ink)]"
        >
          Workers
        </Link>
      </nav>
      {children}
    </div>
  );
}
