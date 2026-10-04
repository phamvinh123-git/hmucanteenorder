"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { cancelCutoff, canCancelSession, canRestoreSession, localDateKey } from "@/lib/client-session-rules";
import { officerWeekDays, openWeekMonday, registrationDeadline } from "@/lib/officer-rules";

type SessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

type OfficerSession = {
  id: string;
  date: string;
  status: SessionStatus;
  pickedUp: boolean;
};

const shortDate = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
const fullDate = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const weekdayLong = new Intl.DateTimeFormat("vi-VN", { weekday: "long" });

const keyOf = (iso: string) => localDateKey(new Date(iso));

export default function OfficerDashboard({ sessions: initialSessions }: { sessions: OfficerSession[] }) {
  const [sessions, setSessions] = useState(initialSessions);

  // The one week that can currently be ordered, and which of its days are ticked.
  const openMonday = useMemo(() => openWeekMonday(new Date()), []);
  const openDays = useMemo(() => officerWeekDays(openMonday), [openMonday]);
  const deadline = useMemo(() => registrationDeadline(openMonday), [openMonday]);
  const [picked, setPicked] = useState<string[]>(() => {
    const keys = new Set(openDays.map(localDateKey));
    return initialSessions.filter((s) => s.status !== "CANCELLED" && keys.has(keyOf(s.date))).map((s) => keyOf(s.date));
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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

  const openKeys = useMemo(() => new Set(openDays.map(localDateKey)), [openDays]);
  const cutoffHour = cancelCutoff(new Date(), "LUNCH").getHours();

  function toggleDay(key: string) {
    setMessage(null);
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function saveWeek() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/officer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: localDateKey(openMonday), dates: picked }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "Không thể lưu đăng ký." });
        return;
      }
      const week: OfficerSession[] = (data.sessions as { id: string; date: string; status: SessionStatus; pickedUp: boolean }[]).map(
        (s) => ({ id: s.id, date: s.date, status: s.status, pickedUp: s.pickedUp }),
      );
      setSessions((prev) => [...prev.filter((s) => !openKeys.has(keyOf(s.date))), ...week]);
      setPicked(week.filter((s) => s.status !== "CANCELLED").map((s) => keyOf(s.date)));
      setMessage({
        ok: true,
        text: data.total > 0 ? `Đã lưu: ${data.total} ngày ăn trưa trong tuần.` : "Đã lưu: tuần này bạn không đăng ký ăn.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function cancelDay(s: OfficerSession) {
    setConfirmingId(null);
    setBusyId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${s.id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không thể hủy cơm.");
        return;
      }
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "CANCELLED" } : x)));
      setPicked((prev) => prev.filter((k) => k !== keyOf(s.date)));
    } finally {
      setBusyId(null);
    }
  }

  async function restoreDay(s: OfficerSession) {
    setConfirmingId(null);
    setBusyId(s.id);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${s.id}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không thể khôi phục cơm.");
        return;
      }
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "SCHEDULED" } : x)));
      if (openKeys.has(keyOf(s.date))) setPicked((prev) => (prev.includes(keyOf(s.date)) ? prev : [...prev, keyOf(s.date)]));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Đặt cơm trưa cho cán bộ"
        subtitle={`Đăng ký trước hết thứ 6 của tuần trước · chỉ ăn trưa · hủy cơm trước ${cutoffHour}h00 sáng cùng ngày.`}
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm animate-rise-in">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              Đăng ký cơm tuần {shortDate.format(openDays[0])} – {shortDate.format(openDays[openDays.length - 1])}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Hạn đăng ký: hết <b>{weekdayLong.format(deadline)} {fullDate.format(deadline)}</b>. Quá hạn sẽ không thêm được ngày mới.
            </p>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setPicked(openDays.map(localDateKey))}
              className="rounded-lg border border-slate-300 px-3 py-1.5 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              Chọn cả tuần
            </button>
            <button
              type="button"
              onClick={() => setPicked([])}
              className="rounded-lg border border-slate-300 px-3 py-1.5 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              Bỏ chọn hết
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {openDays.map((d) => {
            const key = localDateKey(d);
            const on = picked.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(key)}
                aria-pressed={on}
                className={`rounded-2xl border-2 p-3 text-left transition ${
                  on
                    ? "border-red-600 bg-red-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/40"
                }`}
              >
                <p className="text-xs capitalize text-slate-500">{weekdayLong.format(d)}</p>
                <p className="text-lg font-bold text-slate-800">{shortDate.format(d)}</p>
                <p className={`mt-1 text-xs font-semibold ${on ? "text-red-600" : "text-slate-400"}`}>
                  {on ? "✓ Có ăn trưa" : "Không ăn"}
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-slate-200 pt-4">
          <button
            type="button"
            onClick={saveWeek}
            disabled={saving}
            className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
          >
            {saving ? "Đang lưu..." : `Lưu đăng ký (${picked.length} ngày)`}
          </button>
          {message && (
            <span className={`text-sm animate-pop-in ${message.ok ? "text-green-600" : "text-red-600"}`}>{message.text}</span>
          )}
        </div>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 animate-pop-in">{error}</p>}

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-bold text-slate-800">Cơm sắp tới</h2>
          <span className="text-sm text-slate-400">{upcoming.length} bữa</span>
        </div>
        {upcoming.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            Chưa có bữa cơm nào được đăng ký.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((s) => {
            const d = new Date(s.date);
            const check = canCancelSession({ date: d, mealType: "LUNCH", status: s.status });
            return (
              <div key={s.id} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-red-50 text-red-700">
                  <span className="text-xl font-bold leading-none">{d.getDate()}</span>
                  <span className="text-[11px] uppercase">Th{d.getMonth() + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">Bữa trưa</p>
                  <p className="mb-2 text-xs capitalize text-slate-500">{weekdayLong.format(d)}</p>
                  {confirmingId === s.id ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => cancelDay(s)}
                        disabled={busyId === s.id}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 animate-pop-in"
                      >
                        Xác nhận hủy
                      </button>
                      <button
                        onClick={() => setConfirmingId(null)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 animate-pop-in"
                      >
                        Thôi
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(s.id)}
                      disabled={busyId === s.id || !check.ok}
                      title={check.ok ? undefined : check.reason}
                      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Hủy cơm
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <button onClick={() => setShowHistory((v) => !v)} className="text-sm text-red-600 hover:underline">
          {showHistory ? "Ẩn lịch sử" : "Xem lịch sử"}
        </button>
        {showHistory && (
          <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white animate-rise-in">
            {history.length === 0 && <p className="p-4 text-sm text-slate-400">Chưa có lịch sử.</p>}
            {history.map((s) => {
              const d = new Date(s.date);
              const restore =
                s.status === "CANCELLED" ? canRestoreSession({ date: d, mealType: "LUNCH", status: s.status }) : null;
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <span className="w-44 capitalize">
                    {weekdayLong.format(d)}, {fullDate.format(d)}
                  </span>
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${
                      s.status === "CANCELLED" ? "bg-slate-100 text-slate-500" : "bg-green-50 text-green-700"
                    }`}
                  >
                    {s.status === "CANCELLED" ? "Đã hủy" : "Đã dùng"}
                  </span>
                  {restore &&
                    (confirmingId === s.id ? (
                      <span className="ml-auto flex gap-2">
                        <button
                          onClick={() => restoreDay(s)}
                          disabled={busyId === s.id}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50 animate-pop-in"
                        >
                          Xác nhận khôi phục
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 animate-pop-in"
                        >
                          Thôi
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingId(s.id)}
                        disabled={busyId === s.id || !restore.ok}
                        title={restore.ok ? undefined : restore.reason}
                        className="ml-auto rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
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
