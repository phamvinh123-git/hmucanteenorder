"use client";

import { useState } from "react";
import { localDateKey } from "@/lib/client-session-rules";

const DAY_LABELS = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

export const MEAL_ROWS: { type: "LUNCH" | "DINNER"; label: string }[] = [
  { type: "LUNCH", label: "Bữa trưa" },
  { type: "DINNER", label: "Bữa tối" },
];

export function startOfWeekMonday(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addWeeks(d: Date, n: number) {
  return addDays(d, n * 7);
}

const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export default function WeekMealGrid({
  title,
  subtitle,
  renderCell,
  legend,
  weekStart: controlledWeekStart,
  onWeekStartChange,
}: {
  title: string;
  subtitle?: string;
  renderCell: (date: Date, mealType: "LUNCH" | "DINNER") => React.ReactNode;
  legend?: React.ReactNode;
  /** Pass both to control the displayed week from outside (e.g. to drive a data fetch). */
  weekStart?: Date;
  onWeekStartChange?: (weekStart: Date) => void;
}) {
  const [internalWeekStart, setInternalWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const weekStart = controlledWeekStart ?? internalWeekStart;
  const setWeekStart = (updater: (w: Date) => Date) => {
    const next = updater(weekStart);
    if (onWeekStartChange) onWeekStartChange(next);
    else setInternalWeekStart(next);
  };
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const isCurrentWeek = localDateKey(weekStart) === localDateKey(startOfWeekMonday(new Date()));
  const rangeLabel = `${dateFmt.format(days[0])} – ${dateFmt.format(days[6])}`;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {legend && <div className="flex flex-wrap gap-3 text-xs text-slate-500">{legend}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3 text-sm">
        <button
          onClick={() => setWeekStart((w) => addWeeks(w, -1))}
          className="px-3 py-1.5 rounded-lg border border-slate-300 whitespace-nowrap hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        >
          ◀ Tuần trước
        </button>
        <button
          onClick={() => setWeekStart((w) => addWeeks(w, -4))}
          title="Lùi 4 tuần"
          className="px-2 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        >
          «
        </button>
        <div className="order-first flex w-full items-center gap-2 sm:order-none sm:w-auto">
          <span className="px-2 font-medium text-slate-700 whitespace-nowrap">{rangeLabel}</span>
          {isCurrentWeek ? (
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium whitespace-nowrap">Tuần này</span>
          ) : (
            <button
              onClick={() => setWeekStart(() => startOfWeekMonday(new Date()))}
              className="text-xs text-red-600 hover:underline whitespace-nowrap"
            >
              Về tuần này
            </button>
          )}
        </div>
        <span className="ml-auto sm:hidden" />
        <button
          onClick={() => setWeekStart((w) => addWeeks(w, 4))}
          title="Tiến 4 tuần"
          className="px-2 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        >
          »
        </button>
        <button
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          className="px-3 py-1.5 rounded-lg border border-slate-300 whitespace-nowrap hover:border-red-300 hover:bg-red-50 hover:text-red-700"
        >
          Tuần sau ▶
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto animate-rise-in">
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: "110px repeat(7, 1fr)" }}>
          <div className="bg-red-50 border-b border-r border-red-100 p-2 text-xs font-semibold text-slate-600">
            Khung giờ
          </div>
          {days.map((d, i) => (
            <div key={i} className="bg-red-50 border-b border-red-100 p-2 text-center">
              <p className="text-xs font-semibold text-slate-700">{DAY_LABELS[i]}</p>
              <p className="text-xs text-slate-400">{dateFmt.format(d)}</p>
            </div>
          ))}
          {MEAL_ROWS.map((row) => (
            <div key={row.type} className="contents">
              <div className="border-r border-b border-slate-100 p-2 flex items-center">
                <p className="text-xs font-semibold text-slate-700">{row.label}</p>
              </div>
              {days.map((d, i) => (
                <div key={i} className="border-b border-slate-100 p-1.5 min-h-[86px]">
                  {renderCell(d, row.type)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
