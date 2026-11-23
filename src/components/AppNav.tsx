"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import NavLinks from "./NavLinks";

export type NavGroup = {
  key: string;
  title: string;
  icon: string;
  href: string;
  paths: string[];
  items: { href: string; label: string }[];
};

/** The service the current page belongs to (null on the home page and on pages like the profile). */
function useCurrent(groups: NavGroup[]) {
  const pathname = usePathname();
  const current = groups.find((g) => g.paths.some((p) => pathname === p || pathname.startsWith(p + "/"))) ?? null;
  return { pathname, current };
}

/**
 * One dropdown to switch service (home page, canteen, courts...), and the pages inside the service you are in as
 * tabs next to it. Everything else is one click away in the dropdown instead of a long row of buttons.
 */
export default function AppNav({ groups }: { groups: NavGroup[] }) {
  const { pathname, current } = useCurrent(groups);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const onHome = pathname === "/";
  const label = current ? current.title : onHome ? "Trang chủ" : "Dịch vụ";

  return (
    <>
      <div ref={box} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1.5 pl-3 pr-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-red-300 hover:text-red-700"
        >
          <span aria-hidden>{current?.icon ?? "🏠"}</span>
          <span className="max-w-32 truncate">{label}</span>
          <span className="text-xs text-slate-400" aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <div
            role="menu"
            className="absolute left-0 z-40 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl animate-pop-in"
          >
            <MenuLink href="/" icon="🏠" title="Trang chủ" on={onHome} onPick={() => setOpen(false)} />
            {groups.length > 0 && <div className="mx-4 my-1 border-t border-slate-100" />}
            {groups.map((g) => (
              <MenuLink key={g.key} href={g.href} icon={g.icon} title={g.title} on={current?.key === g.key} onPick={() => setOpen(false)} />
            ))}
          </div>
        )}
      </div>
      {current && current.items.length > 1 && <NavLinks items={current.items} className="ml-1 hidden flex-1 md:flex" />}
    </>
  );
}

function MenuLink({ href, icon, title, on, onPick }: { href: string; icon: string; title: string; on: boolean; onPick: () => void }) {
  return (
    <Link
      role="menuitem"
      href={href}
      onClick={onPick}
      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-red-50 ${
        on ? "font-semibold text-red-700" : "text-slate-700"
      }`}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-base" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">{title}</span>
      {on && <span aria-hidden>✓</span>}
    </Link>
  );
}

/** The tabs of the current service on a phone, in their own row under the header. */
export function MobileTabs({ groups }: { groups: NavGroup[] }) {
  const { current } = useCurrent(groups);
  if (!current || current.items.length < 2) return null;
  return <NavLinks items={current.items} className="no-scrollbar mx-auto max-w-6xl overflow-x-auto px-4 pb-2 md:hidden" />;
}
