"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import {
  canBookSlot,
  cancelCutoff,
  canCancelSession,
  canRestoreSession,
  localDateKey,
} from "@/lib/client-session-rules";
import { addDaysLocal, mondayOf, officerWeekDays, openWeekMondays, registrationDeadline } from "@/lib/officer-rules";

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

  // Every week that can be ordered right now (normally one; two during the launch week), and which days are ticked.
  const weeks = useMemo(
    () =>
      openWeekMondays(new Date()).map((monday) => ({
        monday,
        key: localDateKey(monday),
        days: officerWeekDays(monday),
        deadline: registrationDeadline(monday),
      })),
    [],
  );
  // Days with a live registration, in any week. Only days of an open week can be edited.
  const [picked, setPicked] = useState<string[]>(() =>
    initialSessions.filter((s) => s.status !== "CANCELLED").map((s) => keyOf(s.date)),
  );

  // The week on screen, navigable like the student schedule. Only a week that is open can be edited.
  const registerWeek = weeks[0];
  const [viewMonday, setViewMonday] = useState(registerWeek.monday);
  const viewKey = localDateKey(viewMonday);
  const viewDays = officerWeekDays(viewMonday);
  const openWeek = weeks.find((w) => w.key === viewKey) ?? null;
  const thisMonday = mondayOf(new Date());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [savingWeek, setSavingWeek] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { ok: boolean; text: string } | null>>({});
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

  const cutoffHour = cancelCutoff(new Date(), "LUNCH").getHours();

  // Days of a week that can still be added or dropped (a week already under way has locked days).
  const bookableKeys = (days: Date[]) =>
    days.filter((d) => canBookSlot({ date: d, mealType: "LUNCH" }).ok).map(localDateKey);

  const free = openWeek ? bookableKeys(viewDays) : [];

  function shiftWeek(n: number) {
    setViewMonday((m) => addDaysLocal(m, 7 * n));
  }

  function toggleDay(weekKey: string, key: string) {
    setMessages((m) => ({ ...m, [weekKey]: null }));
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function saveWeek(week: (typeof weeks)[number]) {
    setSavingWeek(week.key);
    setMessages((m) => ({ ...m, [week.key]: null }));
    const weekKeys = new Set(week.days.map(localDateKey));
    try {
      const res = await fetch("/api/officer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: week.key, dates: picked.filter((k) => weekKeys.has(k)) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((m) => ({ ...m, [week.key]: { ok: false, text: data.error ?? "Không thể lưu đăng ký." } }));
        return;
      }
      const saved: OfficerSession[] = (data.sessions as OfficerSession[]).map((x) => ({
        id: x.id,
        date: x.date,
        status: x.status,
        pickedUp: x.pickedUp,
      }));
      setSessions((prev) => [...prev.filter((x) => !weekKeys.has(keyOf(x.date))), ...saved]);
      setPicked((prev) => [
        ...prev.filter((k) => !weekKeys.has(k)),
        ...saved.filter((x) => x.status !== "CANCELLED").map((x) => keyOf(x.date)),
      ]);
      setMessages((m) => ({
        ...m,
        [week.key]: {
          ok: true,
          text: data.total > 0 ? `Đã lưu: ${data.total} ngày ăn trưa trong tuần.` : "Đã lưu: tuần này bạn không đăng ký ăn.",
        },
      }));
    } finally {
      setSavingWeek(null);
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
      setPicked((prev) => (prev.includes(keyOf(s.date)) ? prev : [...prev, keyOf(s.date)]));
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
        <h2 className="mb-3 text-base font-bold text-slate-800">Lịch đăng ký cơm theo tuần</h2>

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => shiftWeek(-1)}
            className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            ◀ Tuần trước
          </button>
          <span className="px-2 font-medium whitespace-nowrap text-slate-700">
            {fullDate.format(viewDays[0])} – {fullDate.format(viewDays[viewDays.length - 1])}
          </span>
          {viewMonday.getTime() === thisMonday.getTime() && (
            <span className="whitespace-nowrap rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              Tuần này
            </span>
          )}
          {openWeek && (
            <span className="whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              Đang mở đăng ký
            </span>
          )}
          <button
            type="button"
            onClick={() => shiftWeek(1)}
            className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
          >
            Tuần sau ▶
          </button>
          {!openWeek && (
            <button
              type="button"
              onClick={() => setViewMonday(registerWeek.monday)}
              className="text-xs text-red-600 hover:underline"
            >
              Về tuần đang mở đăng ký
            </button>
          )}
        </div>

        <p className="mb-3 text-xs text-slate-500">
          {openWeek ? (
            <>
              Hạn đăng ký: hết{" "}
              <b>
                {weekdayLong.format(openWeek.deadline)} {fullDate.format(openWeek.deadline)}
              </b>
              . Quá hạn sẽ không thêm được ngày mới.
            </>
          ) : viewMonday.getTime() < thisMonday.getTime() ? (
            "Tuần đã qua, chỉ để xem."
          ) : viewMonday.getTime() === thisMonday.getTime() ? (
            "Tuần đang diễn ra đã hết hạn đăng ký. Muốn bỏ một ngày, dùng nút Hủy cơm ở mục Cơm sắp tới."
          ) : (
            <>
              Chưa đến thời gian đăng ký tuần này (mở từ thứ 7 ngày {fullDate.format(addDaysLocal(viewMonday, -9))}).
              Chỉ đăng ký trước 1 tuần.
            </>
          )}
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {viewDays.map((d) => {
            const key = localDateKey(d);
            const on = picked.includes(key);
            const locked = !free.includes(key);
            const past = d.getTime() < today.getTime();
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleDay(viewKey, key)}
                disabled={locked}
                aria-pressed={on}
                className={`relative rounded-2xl border-2 p-3 text-left transition disabled:cursor-not-allowed ${
                  on
                    ? "border-red-600 bg-red-600 text-white shadow-md disabled:opacity-90"
                    : "border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/40 disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
                }`}
              >
                {on && (
                  <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-red-600">
                    ✓
                  </span>
                )}
                <p className={`text-xs capitalize ${on ? "text-red-100" : "text-slate-500"}`}>{weekdayLong.format(d)}</p>
                <p className={`text-lg font-bold ${on ? "text-white" : "text-slate-800"}`}>{shortDate.format(d)}</p>
                <p className={`mt-1 text-xs font-semibold ${on ? "text-white" : "text-slate-400"}`}>
                  {on ? "Đã đăng ký" : past ? "Không ăn" : openWeek ? (locked ? "Đã quá hạn" : "Chưa đăng ký") : "Chưa mở đăng ký"}
                </p>
              </button>
            );
          })}
        </div>

        {openWeek && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setPicked((prev) => Array.from(new Set([...prev, ...free])))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              Chọn cả tuần
            </button>
            <button
              type="button"
              onClick={() => setPicked((prev) => prev.filter((k) => !free.includes(k)))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              Bỏ chọn hết
            </button>
            <button
              type="button"
              onClick={() => saveWeek(openWeek)}
              disabled={savingWeek === openWeek.key}
              className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
            >
              {savingWeek === openWeek.key
                ? "Đang lưu..."
                : `Lưu đăng ký (${picked.filter((k) => viewDays.some((d) => localDateKey(d) === k)).length} ngày)`}
            </button>
            {messages[openWeek.key] && (
              <span className={`text-sm animate-pop-in ${messages[openWeek.key]!.ok ? "text-green-600" : "text-red-600"}`}>
                {messages[openWeek.key]!.text}
              </span>
            )}
          </div>
        )}
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
