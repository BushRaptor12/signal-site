"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const ADMIN_PAGES = [
  { href: "/admin", label: "Control center" },
  { href: "/admin/editor", label: "Story editor" },
  { href: "/admin/briefing", label: "Briefing manager" },
  { href: "/admin/coverage", label: "Coverage editor" },
  { href: "/admin/discovery", label: "RSS discovery" },
  { href: "/admin/entities", label: "Entities manager" },
  { href: "/admin/facebook", label: "Facebook graphic maker" },
  { href: "/admin/moderation", label: "Moderation console" },
  { href: "/admin/analytics", label: "Analytics" },
];

export default function AdminNavigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800/80 bg-[#05080d]/95 text-neutral-100 backdrop-blur">
      <nav aria-label="Admin navigation" className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-500 hover:bg-neutral-800 hover:text-white"
        >
          ← Back to home
        </Link>

        <div className="relative">
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls="admin-page-menu"
            onClick={() => setIsOpen((open) => !open)}
            className="inline-flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800 hover:text-white"
          >
            Admin pages
            <span aria-hidden="true" className={`text-xs transition-transform ${isOpen ? "rotate-180" : ""}`}>⌄</span>
          </button>
          {isOpen ? (
            <div
              id="admin-page-menu"
              className="absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-neutral-700 bg-[#0b1119] p-2 shadow-2xl"
            >
              {ADMIN_PAGES.map((page) => {
                const active = pathname === page.href;
                return (
                  <Link
                    key={page.href}
                    href={page.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setIsOpen(false)}
                    className={`block rounded-xl px-3 py-2.5 text-sm transition ${
                      active ? "bg-neutral-800 font-semibold text-white" : "text-neutral-300 hover:bg-neutral-800/70 hover:text-white"
                    }`}
                  >
                    {page.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </nav>
    </header>
  );
}
