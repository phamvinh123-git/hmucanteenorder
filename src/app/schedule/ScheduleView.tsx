"use client";

import PageHeader from "@/components/PageHeader";
import { useEffect, useMemo, useState } from "react";
import WeekMealGrid, { startOfWeekMonday } from "@/components/WeekMealGrid";
import { localDateKey } from "@/lib/client-session-rules";

type MealType = "LUNCH" | "DINNER";
type SessionStatus = "SCHEDULED" | "COMPLETED";

type ScheduleSession = {
  id: string;
  date: string;
  mealType: MealType;
  status: SessionStatus;
  note: string | null;
  price: number;
  pickedUp: boolean;
  studentId: string;
  studentName: string;
  studentPhone: string;
  orderCode: number | null;
  major: string | null;
  className: string | null;
};

const MEAL_LABEL: Record<MealType, string> = { LUNCH: "Trưa", DINNER: "Tối" };
const STATUS_LABEL: Record<SessionStatus, string> = { SCHEDULED: "Sắp tới", COMPLETED: "Đã dùng" };
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

const dateFmt = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

function sortByOrderCode(a: ScheduleSession, b: ScheduleSession) {
  if (a.orderCode != null && b.orderCode != null) return a.orderCode - b.orderCode;
  if (a.orderCode != null) return -1;
  if (b.orderCode != null) return 1;
  return a.studentName.localeCompare(b.studentName, "vi");
}

export default function ScheduleView() {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{ date: string; mealType: MealType } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload indicator when the visible week changes
    setLoading(true);
    fetch(`/api/schedule?weekStart=${localDateKey(weekStart)}`)
      .then((res) => res.json())
      .then((data) => setSessions(data.sessions ?? []))
      .finally(() => setLoading(false));
  }, [weekStart]);

  const byCell = useMemo(() => {
    const map = new Map<string, ScheduleSession[]>();
    for (const s of sessions) {
      const key = `${localDateKey(new Date(s.date))}_${s.mealType}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions]);

  const selectedList = useMemo(() => {
    if (!selectedCell) return [];
    const list = byCell.get(`${selectedCell.date}_${selectedCell.mealType}`) ?? [];
    return [...list].sort(sortByOrderCode);
  }, [byCell, selectedCell]);

  async function togglePickedUp(s: ScheduleSession) {
    const next = !s.pickedUp;
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, pickedUp: next } : x)));
    const res = await fetch(`/api/sessions/${s.id}/pickup`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pickedUp: next }),
    });
    if (!res.ok) {
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, pickedUp: !next } : x)));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Lịch tuần" subtitle="Tổng quan số suất ăn Trưa/Tối mỗi ngày. Nhấp vào 1 ô để xem danh sách, tích đã lấy đồ ăn, hoặc in danh sách." />

      <WeekMealGrid
        title="Số suất ăn theo tuần"
        weekStart={weekStart}
        onWeekStartChange={(w) => {
          setWeekStart(w);
          setSelectedCell(null);
        }}
        renderCell={(date, mealType) => {
          const key = `${localDateKey(date)}_${mealType}`;
          const list = byCell.get(key) ?? [];
          const isSelected = selectedCell?.date === localDateKey(date) && selectedCell.mealType === mealType;
          if (list.length === 0) {
            return (
              <button
                onClick={() => setSelectedCell({ date: localDateKey(date), mealType })}
                className={`w-full h-full rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-300 hover:border-red-200 hover:text-red-300 transition-colors ${
                  isSelected ? "ring-2 ring-red-400 ring-offset-1" : ""
                }`}
              >
                0
              </button>
            );
          }
          const pickedCount = list.filter((s) => s.pickedUp).length;
          return (
            <button
              onClick={() => setSelectedCell({ date: localDateKey(date), mealType })}
              className={`w-full h-full rounded-lg border-2 border-red-200 bg-red-50 p-2 text-left hover:shadow-sm transition-all ${
                isSelected ? "ring-2 ring-red-400 ring-offset-1" : ""
              }`}
            >
              <p className="text-lg font-bold text-red-700">{list.length}</p>
              <p className="text-[11px] text-red-500">
                sinh viên{pickedCount > 0 ? ` · ${pickedCount} đã lấy` : ""}
              </p>
            </button>
          );
        }}
      />

      {loading && <p className="text-sm text-slate-400">Đang tải dữ liệu...</p>}

      {selectedCell && (
        <div className="bg-white border border-red-200 rounded-2xl shadow-sm p-4 animate-rise-in">
          <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {dateFmt.format(new Date(selectedCell.date))} &middot; Bữa {MEAL_LABEL[selectedCell.mealType]}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedList.length} sinh viên &middot; {selectedList.filter((s) => s.pickedUp).length} đã lấy đồ ăn
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`/schedule/print?date=${selectedCell.date}&mealType=${selectedCell.mealType}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                In danh sách
              </a>
              <button onClick={() => setSelectedCell(null)} className="text-xs text-slate-400 hover:text-slate-600">
                Đóng ✕
              </button>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {selectedList.length === 0 && <p className="text-sm text-slate-400 py-2">Chưa có sinh viên nào đăng ký bữa này.</p>}
            {selectedList.map((s) => (
              <div
                key={s.id}
                className={`py-2 flex items-center gap-3 sm:gap-4 text-sm flex-wrap transition-colors ${
                  s.pickedUp ? "bg-red-600 px-3 rounded-lg [&_*]:!text-white" : ""
                }`}
              >
                <span className="font-mono text-xs text-red-700 w-10 flex-shrink-0">
                  {s.orderCode ?? "—"}
                </span>
                <span className="font-medium text-slate-800 w-40 flex-shrink-0">{s.studentName}</span>
                <span className="text-slate-400 w-28 flex-shrink-0 truncate" title={s.major ?? undefined}>
                  {s.className || "—"}
                  {s.major ? ` · ${s.major.replace(/^Cử nhân /, "")}` : ""}
                </span>
                <span className="text-slate-400 w-32 flex-shrink-0">{s.studentPhone}</span>
                <span className="text-slate-600 w-24 flex-shrink-0">{currency.format(s.price)}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    s.pickedUp
                      ? "bg-white/25 text-white font-semibold"
                      : s.status === "COMPLETED"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-red-50 text-red-700"
                  }`}
                >
                  {s.pickedUp ? "Đã lấy" : s.status === "COMPLETED" ? "Chưa lấy" : STATUS_LABEL[s.status]}
                </span>
                {s.note && <span className="text-slate-400 italic truncate flex-1 min-w-0">{s.note}</span>}
                <label className="flex items-center gap-1.5 ml-auto flex-shrink-0 cursor-pointer text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={s.pickedUp}
                    onChange={() => togglePickedUp(s)}
                    className={`w-4 h-4 ${s.pickedUp ? "accent-white" : "accent-red-600"}`}
                  />
                  Đã lấy
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
