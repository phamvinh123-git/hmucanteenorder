"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

// The page you are on is highlighted. A parent path (e.g. /manager) must not light up on its child
// (/manager/stats) when the child has its own entry, so the longest matching entry wins.
function activeHref(items: Item[], pathname: string) {
  const matches = items.filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** The menu of a page: pills on a row, scrolling sideways on a phone. */
export default function NavLinks({ items, className = "" }: { items: Item[]; className?: string }) {
  const pathname = usePathname();
  const active = activeHref(items, pathname);
  return (
    <nav className={`flex items-center gap-1 ${className}`} aria-label="Menu chính">
      {items.map((item) => {
        const on = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              on
                ? "bg-red-600 font-semibold text-white shadow-sm"
                : "font-medium text-slate-600 hover:bg-red-50 hover:text-red-700"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
