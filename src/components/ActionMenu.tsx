"use client";

import { useEffect, useRef, useState } from "react";

export type ActionItem = {
  label: string;
  onClick: () => void;
  /** Heading shown above the first item of each section. */
  section?: string;
  disabled?: boolean;
  hint?: string;
  danger?: boolean;
};

/** Several secondary buttons folded into one dropdown: a button that opens a short list to pick from. */
export default function ActionMenu({ label, items, align = "right" }: { label: string; items: ActionItem[]; align?: "left" | "right" }) {
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

  if (items.length === 0) return null;
  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
      >
        {label}
        <span className="text-slate-400" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl animate-pop-in ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item, i) => (
            <div key={item.label}>
              {item.section && item.section !== items[i - 1]?.section && (
                <p className={`px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${i > 0 ? "mt-1 border-t border-slate-100" : ""}`}>
                  {item.section}
                </p>
              )}
              <button
                role="menuitem"
                disabled={item.disabled}
                title={item.hint}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`block w-full px-4 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                  item.danger ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-red-50 hover:text-red-700"
                }`}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
