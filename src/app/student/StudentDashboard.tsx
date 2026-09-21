"use client";

import { useMemo, useState } from "react";
import {
  cancelCutoff,
  canCancelSession,
  canRestoreSession,
  localDateKey,
  LOW_MEAL_THRESHOLD,
} from "@/lib/client-session-rules";
import WeekMealGrid from "@/components/WeekMealGrid";
import RulesNoticeModal from "@/components/RulesNoticeModal";

type MealPattern = "LUNCH" | "DINNER" | "BOTH";
type MealType = "LUNCH" | "DINNER";
type SessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

type SessionDTO = {
  id: string;
  date: string;
  mealType: MealType;
  status: SessionStatus;
  pickedUp: boolean;
  note: string | null;
  price: number;
  /** Auto-added after a cancellation; a make-up slot. */
  isCompensation: boolean;
  mealPattern: MealPattern;
};

const MEAL_LABEL: Record<MealType, string> = { LUNCH: "Trưa", DINNER: "Tối" };
const STATUS_LABEL: Record<SessionStatus, string> = {
  SCHEDULED: "Sắp tới",
  COMPLETED: "Đã dùng",
  CANCELLED: "Đã hủy",
};
const STATUS_STYLE: Record<SessionStatus, string> = {
  SCHEDULED: "bg-red-50 text-red-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-slate-100 text-slate-400 line-through",
};

// "Past" is decided by the date, but whether the meal was actually received
// is only known once staff tick "Đã lấy", so the two are shown separately.
type StatusInput = { status: SessionStatus; pickedUp: boolean };
function statusLabel(s: StatusInput) {
  if (s.status === "COMPLETED") return s.pickedUp ? "Đã nhận" : "Chưa ghi nhận lấy";
  return STATUS_LABEL[s.status];
}
function statusStyle(s: StatusInput) {
  if (s.status === "COMPLETED" && !s.pickedUp) return "bg-amber-50 text-amber-700";
  return STATUS_STYLE[s.status];
}

const dateFmt = new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

function fmtDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

export default function StudentDashboard({
  studentName,
  orderCode,
  sessions: initialSessions,
}: {
  studentName: string;
  orderCode: number | null;
  sessions: SessionDTO[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const remaining = sessions.filter((s) => s.status === "SCHEDULED").length;
  const lowMeal = remaining < LOW_MEAL_THRESHOLD;

  const upcoming = useMemo(
    () =>
      sessions
        .filter((s) => s.status === "SCHEDULED")
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [sessions],
  );
  const history = useMemo(
    () =>
      sessions
        .filter((s) => s.status !== "SCHEDULED")
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [sessions],
  );

  async function cancelSession(id: string) {
    setConfirmingId(null);
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không thể hủy buổi ăn.");
        return;
      }
      setSessions((prev) => {
        const source = prev.find((s) => s.id === id);
        const next = prev.map((s) => (s.id === id ? { ...s, status: "CANCELLED" as SessionStatus } : s));
        next.push({
          id: data.newSession.id,
          date: data.newSession.date,
          mealType: data.newSession.mealType,
          status: "SCHEDULED",
          pickedUp: false,
          note: null,
          price: data.newSession.price,
          isCompensation: true,
          mealPattern: source?.mealPattern ?? "BOTH",
        });
        return next;
      });
    } finally {
      setBusyId(null);
    }
  }

  async function restoreSession(id: string) {
    setConfirmingId(null);
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${id}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không thể khôi phục buổi ăn.");
        return;
      }
      setSessions((prev) =>
        prev
          .filter((s) => s.id !== data.removedCompensationId)
          .map((s) => (s.id === id ? { ...s, status: "SCHEDULED" as SessionStatus } : s)),
      );
    } finally {
      setBusyId(null);
    }
  }

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, SessionDTO[]>();
    for (const s of sessions) {
      const key = localDateKey(new Date(s.date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [sessions]);

  const selectedSession = sessions.find((s) => s.id === selectedId) ?? null;

  const todayKey = localDateKey(new Date());
  const todaySessions = sessionsByDay.get(todayKey) ?? [];
  const usedCount = sessions.filter((s) => s.status === "COMPLETED").length;
  const activeTotal = remaining + usedCount;
  const usedPercent = activeTotal > 0 ? Math.round((usedCount / activeTotal) * 100) : 0;
  const todayLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, 8);

  // Cancel / change-day actions for a scheduled meal, shared by every card.
  function renderActions(s: SessionDTO) {
    if (s.status !== "SCHEDULED") return null;
    const check = canCancelSession({ date: new Date(s.date), mealType: s.mealType, status: s.status });
    return (
      <div className="flex flex-wrap items-center gap-2">
        {confirmingId === s.id ? (
          <>
            <button
              onClick={() => cancelSession(s.id)}
              disabled={busyId === s.id}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-50 animate-pop-in"
            >
              Xác nhận hủy
            </button>
            <button
              onClick={() => setConfirmingId(null)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 animate-pop-in"
            >
              Thôi
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingId(s.id)}
            disabled={busyId === s.id || !check.ok}
            title={check.ok ? undefined : check.reason}
            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hủy bữa
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 via-red-600 to-red-500 p-6 text-white shadow-lg shadow-red-200 animate-rise-in sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm capitalize text-red-100">{todayLabel}</p>
            <h1 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">Xin chào, {studentName}</h1>
            {orderCode != null && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-sm backdrop-blur-sm">
                <span className="text-red-100">Số thứ tự của bạn</span>
                <span className="text-lg font-bold leading-none">{orderCode}</span>
              </p>
            )}
            <p className="mt-1 text-sm text-red-100">Chúc bạn ngon miệng. Xem và quản lý suất ăn của mình tại đây.</p>
          </div>
          <div className="min-w-[220px] rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-wide text-red-100">Suất ăn còn lại</p>
            <p className="text-4xl font-bold leading-none">
              {remaining}
              <span className="ml-1 text-base font-medium text-red-100">buổi</span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${usedPercent}%` }} />
            </div>
            <p className="mt-1 text-xs text-red-100">
              Đã dùng {usedCount}/{activeTotal} buổi
            </p>
          </div>
        </div>
        {lowMeal && (
          <p className="relative mt-4 rounded-xl bg-amber-400/90 px-4 py-2 text-sm font-medium text-amber-950 animate-pop-in">
            Bạn sắp hết suất ăn, vui lòng liên hệ bộ phận bán hàng để đăng ký thêm.
          </p>
        )}
      </div>

      <RulesNoticeModal />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 animate-pop-in">{error}</p>}

      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-800">Hôm nay</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["LUNCH", "DINNER"] as MealType[]).map((meal, i) => {
            const s = todaySessions.find((x) => x.mealType === meal);
            const cutoff = `${cancelCutoff(new Date(), meal).getHours()}:00`;
            const tone =
              !s || s.status === "CANCELLED"
                ? "border-slate-200 bg-slate-50"
                : s.status === "COMPLETED"
                  ? s.pickedUp
                    ? "border-green-200 bg-green-50/60"
                    : "border-amber-200 bg-amber-50/60"
                  : "border-red-200 bg-white shadow-sm shadow-red-100";
            return (
              <div
                key={meal}
                className={`rounded-2xl border-2 p-5 transition-shadow hover:shadow-md animate-rise-in ${tone}`}
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                        meal === "LUNCH" ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"
                      }`}
                    >
                      {meal === "LUNCH" ? (
                        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <circle cx="12" cy="12" r="4" />
                          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-800">Bữa {MEAL_LABEL[meal].toLowerCase()}</p>
                      <p className="text-xs text-slate-500">Hủy hoặc đổi trước {cutoff} hôm nay</p>
                    </div>
                  </div>
                  {s ? (
                    <span className={`flex-shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(s)}`}>{statusLabel(s)}</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400">
                      Không có suất
                    </span>
                  )}
                </div>
                {s && s.status === "SCHEDULED" && <div className="mt-4">{renderActions(s)}</div>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <WeekMealGrid
          title="Lịch ăn"
          subtitle="Dùng nút điều hướng để xem các tuần khác. Nhấp vào 1 ô để xem chi tiết, ghi chú hoặc hủy."
          legend={
            <>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200 inline-block" /> Đã đặt
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-green-50 border border-green-200 inline-block" /> Đã nhận
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-50 border border-amber-200 inline-block" /> Chưa ghi nhận lấy
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-200 inline-block" /> Đã hủy
              </span>
            </>
          }
          renderCell={(date, mealType) => {
            const key = localDateKey(date);
            const s = (sessionsByDay.get(key) ?? []).find((x) => x.mealType === mealType);
            if (!s) {
              return <div className="h-full flex items-center justify-center text-slate-300 text-xs">—</div>;
            }
            const cellStyle =
              s.status === "CANCELLED"
                ? "border-slate-200 bg-slate-50 text-slate-400"
                : s.status === "COMPLETED"
                  ? s.pickedUp
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-red-200 bg-red-50 text-red-700";
            return (
              <button
                onClick={() => setSelectedId(s.id)}
                className={`w-full h-full rounded-lg border-2 p-2 text-left text-xs transition-all hover:shadow-sm ${cellStyle} ${
                  selectedId === s.id ? "ring-2 ring-red-400 ring-offset-1" : ""
                }`}
              >
                <p className="font-semibold">{statusLabel(s)}</p>
              </button>
            );
          }}
        />

        {selectedSession && (
          <div className="mt-3 bg-white border border-red-200 rounded-xl p-4 animate-rise-in">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {fmtDate(selectedSession.date)} &middot; Bữa {MEAL_LABEL[selectedSession.mealType]}
                </p>
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${statusStyle(selectedSession)}`}>
                  {statusLabel(selectedSession)}
                </span>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-xs text-slate-400 hover:text-slate-600">
                Đóng ✕
              </button>
            </div>

            {selectedSession.status === "SCHEDULED" && (
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex gap-2 flex-shrink-0">
                  {(() => {
                    const check = canCancelSession({
                      date: new Date(selectedSession.date),
                      mealType: selectedSession.mealType,
                      status: selectedSession.status,
                    });
                    if (confirmingId === selectedSession.id) {
                      return (
                        <>
                          <button
                            onClick={() => cancelSession(selectedSession.id)}
                            disabled={busyId === selectedSession.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 animate-pop-in"
                          >
                            Xác nhận hủy
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 animate-pop-in"
                          >
                            Thôi
                          </button>
                        </>
                      );
                    }
                    return (
                      <button
                        onClick={() => setConfirmingId(selectedSession.id)}
                        disabled={busyId === selectedSession.id || !check.ok}
                        title={check.ok ? undefined : check.reason}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Hủy bữa
                      </button>
                    );
                  })()}
                </div>
                {selectedSession.isCompensation && selectedSession.status === "SCHEDULED" && (
                  <span className="text-xs text-slate-400">Đây là buổi bù được thêm sau khi bạn hủy.</span>
                )}
              </div>
            )}
            {selectedSession.status === "CANCELLED" &&
              (() => {
                const check = canRestoreSession({
                  date: new Date(selectedSession.date),
                  mealType: selectedSession.mealType,
                  status: selectedSession.status,
                });
                return (
                  <div className="mt-3 flex items-center gap-2">
                    {confirmingId === selectedSession.id ? (
                      <>
                        <button
                          onClick={() => restoreSession(selectedSession.id)}
                          disabled={busyId === selectedSession.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 animate-pop-in"
                        >
                          Xác nhận khôi phục
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 animate-pop-in"
                        >
                          Thôi
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(selectedSession.id)}
                        disabled={busyId === selectedSession.id || !check.ok}
                        title={check.ok ? undefined : check.reason}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Khôi phục buổi ăn
                      </button>
                    )}
                  </div>
                );
              })()}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-bold text-slate-800">Sắp tới</h2>
          <span className="text-sm text-slate-400">{upcoming.length} buổi</span>
        </div>
        {upcoming.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            Không có buổi ăn sắp tới.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleUpcoming.map((s, i) => {
            const d = new Date(s.date);
            return (
              <div
                key={s.id}
                className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md animate-rise-in"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
              >
                <div className="flex h-16 w-16 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-red-50 text-red-700">
                  <span className="text-2xl font-bold leading-none">{d.getDate()}</span>
                  <span className="text-[11px] uppercase">Th{d.getMonth() + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    Bữa {MEAL_LABEL[s.mealType].toLowerCase()}
                    {s.isCompensation && (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        Buổi bù
                      </span>
                    )}
                  </p>
                  <p className="mb-2 text-xs capitalize text-slate-500">
                    {new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(d)}
                  </p>
                  {renderActions(s)}
                </div>
              </div>
            );
          })}
        </div>
        {upcoming.length > 8 && (
          <button
            onClick={() => setShowAllUpcoming((v) => !v)}
            className="mt-3 text-sm font-medium text-red-600 hover:underline"
          >
            {showAllUpcoming ? "Thu gọn" : `Xem tất cả ${upcoming.length} buổi`}
          </button>
        )}
      </section>

      <section>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="text-sm text-red-600 hover:underline"
        >
          {showHistory ? "Ẩn lịch sử" : "Xem lịch sử buổi ăn"}
        </button>
        {showHistory && (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 mt-2 animate-rise-in">
            {history.length === 0 && <p className="p-4 text-sm text-slate-400">Chưa có lịch sử.</p>}
            {history.map((s) => {
              const restoreCheck =
                s.status === "CANCELLED"
                  ? canRestoreSession({ date: new Date(s.date), mealType: s.mealType, status: s.status })
                  : null;
              return (
                <div key={s.id} className="p-3 flex flex-wrap items-center gap-3 sm:gap-4 text-sm">
                  <span className="w-40">{fmtDate(s.date)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${statusStyle(s)}`}>
                    Bữa {MEAL_LABEL[s.mealType]} &middot; {statusLabel(s)}
                  </span>
                  {restoreCheck &&
                    (confirmingId === s.id ? (
                      <span className="ml-auto flex gap-2">
                        <button
                          onClick={() => restoreSession(s.id)}
                          disabled={busyId === s.id}
                          className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:opacity-50 animate-pop-in"
                        >
                          Xác nhận khôi phục
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 animate-pop-in"
                        >
                          Thôi
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(s.id)}
                        disabled={busyId === s.id || !restoreCheck.ok}
                        title={restoreCheck.ok ? undefined : restoreCheck.reason}
                        className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Khôi phục
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
