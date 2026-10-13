"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "./LogoutButton";

/** Name, role and the account links (profile, password, log out) in one small dropdown. */
export default function UserMenu({ name, roleLabel }: { name: string; roleLabel: string }) {
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

  // Vietnamese names end with the given name: its first letter is the avatar.
  const initial = (name.trim().split(/\s+/).at(-1)?.[0] ?? "?").toUpperCase();

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm transition-colors hover:border-red-300"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-400 text-sm font-bold text-white">
          {initial}
        </span>
        <span className="hidden max-w-40 text-left leading-tight sm:block">
          <span className="block truncate text-sm font-semibold text-slate-800">{name}</span>
          <span className="block text-[11px] text-slate-400">{roleLabel}</span>
        </span>
        <span className="text-xs text-slate-400" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl animate-pop-in"
        >
          <div className="border-b border-slate-100 bg-red-50/60 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
            <p className="text-xs text-red-700">{roleLabel}</p>
          </div>
          <div className="flex flex-col py-1 text-sm">
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="px-4 py-2 text-slate-700 hover:bg-red-50 hover:text-red-700">
              Hồ sơ cá nhân
            </Link>
            <Link role="menuitem" href="/change-password" onClick={() => setOpen(false)} className="px-4 py-2 text-slate-700 hover:bg-red-50 hover:text-red-700">
              Đổi mật khẩu
            </Link>
            <LogoutButton className="px-4 py-2 text-left text-slate-700 hover:bg-red-50 hover:text-red-700" />
          </div>
        </div>
      )}
    </div>
  );
}
