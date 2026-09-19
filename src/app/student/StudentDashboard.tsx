"use client";

import { useMemo, useState } from "react";
import { canCancelSession, canRestoreSession, localDateKey, LOW_MEAL_THRESHOLD } from "@/lib/client-session-rules";
import WeekMealGrid from "@/components/WeekMealGrid";

type MealPattern = "LUNCH" | "DINNER" | "BOTH";
type MealType = "LUNCH" | "DINNER";
type SessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

type RegistrationDTO = {
  id: string;
  startDate: string;
  totalSessions: number;
  mealPattern: MealPattern;
  pricePerMeal: number;
  note: string | null;
  createdAt: string;
};

type SessionDTO = {
  id: string;
  date: string;
  mealType: MealType;
  status: SessionStatus;
  note: string | null;
  price: number;
};

const MEAL_LABEL: Record<MealType, string> = { LUNCH: "Trưa", DINNER: "Tối" };
const PATTERN_LABEL: Record<MealPattern, string> = { LUNCH: "Trưa", DINNER: "Tối", BOTH: "Trưa & Tối" };
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

const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const dateFmt = new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });

function fmtDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

export default function StudentDashboard({
  studentName,
  registrations,
  sessions: initialSessions,
}: {
  studentName: string;
  registrations: RegistrationDTO[];
  sessions: SessionDTO[];
}) {
  const [sessions, setSessions] = useState(initialSessions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [showHistory, setShowHistory] = useState(false);
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
        const next = prev.map((s) => (s.id === id ? { ...s, status: "CANCELLED" as SessionStatus } : s));
        next.push({
          id: data.newSession.id,
          date: data.newSession.date,
          mealType: data.newSession.mealType,
          status: "SCHEDULED",
          note: null,
          price: data.newSession.price,
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

  async function saveNote(id: string) {
    const note = noteDrafts[id] ?? "";
    setBusyId(id);
    try {
      const res = await fetch(`/api/sessions/${id}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (res.ok) {
        setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, note } : s)));
      }
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Xin chào, {studentName}</h1>
        <p className="text-sm text-slate-500">Theo dõi và quản lý lịch ăn của bạn.</p>
      </div>

      <div
        className={`rounded-xl border p-4 animate-rise-in ${
          lowMeal ? "bg-red-50 border-red-300 animate-pop-in shadow-sm shadow-red-100" : "bg-white border-slate-200"
        }`}
      >
        <p className={`text-sm ${lowMeal ? "text-red-700 font-semibold" : "text-slate-600"}`}>
          Số buổi ăn còn lại: <span className="text-lg font-bold">{remaining}</span>
        </p>
        {lowMeal && (
          <p className="text-sm text-red-600 mt-1">
            Bạn sắp hết suất ăn, vui lòng liên hệ bộ phận bán hàng để đăng ký thêm.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 animate-pop-in">{error}</p>}

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Đăng ký suất ăn</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {registrations.map((r, i) => (
            <div
              key={r.id}
              className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-xl p-4 text-sm animate-rise-in transition-shadow hover:shadow-md"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <p className="font-medium text-slate-800">
                {r.totalSessions} buổi &middot; {PATTERN_LABEL[r.mealPattern]}
              </p>
              <p className="text-slate-500">Bắt đầu: {fmtDate(r.startDate)}</p>
              <p className="text-slate-500">Giá mỗi suất: {currency.format(r.pricePerMeal)}</p>
              {r.note && <p className="text-slate-400 mt-1 italic">Ghi chú: {r.note}</p>}
            </div>
          ))}
          {registrations.length === 0 && (
            <p className="text-sm text-slate-400">Chưa có đăng ký nào. Vui lòng liên hệ bộ phận bán hàng.</p>
          )}
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
                <span className="w-2.5 h-2.5 rounded-sm bg-green-50 border border-green-200 inline-block" /> Đã dùng
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
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700";
            return (
              <button
                onClick={() => setSelectedId(s.id)}
                className={`w-full h-full rounded-lg border-2 p-2 text-left text-xs transition-all hover:shadow-sm ${cellStyle} ${
                  selectedId === s.id ? "ring-2 ring-red-400 ring-offset-1" : ""
                }`}
              >
                <p className="font-semibold">{STATUS_LABEL[s.status]}</p>
                {s.note && <p className="truncate mt-0.5 opacity-70">{s.note}</p>}
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
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[selectedSession.status]}`}>
                  {STATUS_LABEL[selectedSession.status]}
                </span>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-xs text-slate-400 hover:text-slate-600">
                Đóng ✕
              </button>
            </div>

            {selectedSession.status === "SCHEDULED" && (
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <input
                  type="text"
                  placeholder="Ghi chú bữa ăn (vd: không hành, ăn chay...)"
                  defaultValue={selectedSession.note ?? ""}
                  onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [selectedSession.id]: e.target.value }))}
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => saveNote(selectedSession.id)}
                    disabled={busyId === selectedSession.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  >
                    Lưu ghi chú
                  </button>
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
            {selectedSession.status !== "SCHEDULED" && selectedSession.note && (
              <p className="mt-2 text-sm text-slate-500 italic">Ghi chú: {selectedSession.note}</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Buổi ăn sắp tới</h2>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {upcoming.length === 0 && <p className="p-4 text-sm text-slate-400">Không có buổi ăn sắp tới.</p>}
          {upcoming.map((s, i) => {
            const check = canCancelSession({ date: new Date(s.date), mealType: s.mealType, status: s.status });
            return (
              <div
                key={s.id}
                className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 animate-rise-in hover:bg-red-50/40 transition-colors"
                style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              >
                <div className="sm:w-48 flex-shrink-0">
                  <p className="text-sm font-medium text-slate-800">{fmtDate(s.date)}</p>
                  <span className={`inline-block mt-0.5 text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[s.status]}`}>
                    Bữa {MEAL_LABEL[s.mealType]}
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="Ghi chú bữa ăn (vd: không hành, ăn chay...)"
                  defaultValue={s.note ?? ""}
                  onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => saveNote(s.id)}
                    disabled={busyId === s.id}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  >
                    Lưu ghi chú
                  </button>
                  {confirmingId === s.id ? (
                    <>
                      <button
                        onClick={() => cancelSession(s.id)}
                        disabled={busyId === s.id}
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
                  ) : (
                    <button
                      onClick={() => setConfirmingId(s.id)}
                      disabled={busyId === s.id || !check.ok}
                      title={check.ok ? undefined : check.reason}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                    >
                      Hủy bữa
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_STYLE[s.status]}`}>
                    Bữa {MEAL_LABEL[s.mealType]} &middot; {STATUS_LABEL[s.status]}
                  </span>
                  {s.note && <span className="text-slate-400 italic flex-1 min-w-0 truncate">{s.note}</span>}
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
