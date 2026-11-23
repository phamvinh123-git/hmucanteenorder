"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localDateKey } from "@/lib/client-session-rules";
import { COURT_KINDS, openDaysLabel, WEEKDAYS, type CourtKind } from "@/lib/court-kinds";
import Court3D from "./Court3D";
import { btnGhost, btnPrimary, call, dayOfKey, fmtKey, input, post, STATUS_LABEL, type Mode, type Status } from "./shared";

type BoardSlot = {
  id: string;
  startTime: string;
  endTime: string;
  past: boolean;
  booking: { id: string; status: Status; mine: boolean; who: string | null; note: string | null } | null;
};
type BoardCourt = {
  id: string;
  name: string;
  description: string | null;
  managerName: string | null;
  kind: CourtKind;
  openDays: number[];
  /** Lent out on the day being looked at. */
  open: boolean;
  /** What happens to a booking made now: approved at once, or it waits (for the union, then the court manager). */
  startsAs: "PENDING" | "UNION_APPROVED" | "APPROVED";
  slots: BoardSlot[];
};

const DAYS_SHOWN = 15;
const CONFETTI_COLORS = ["#be1651", "#f59f00", "#22a085", "#3b82c4", "#7c3aed", "#ea6f9a"];

/** "17:00" as "17h". */
function hour(t: string) {
  return t.endsWith(":00") ? `${Number(t.slice(0, 2))}h` : t.replace(":", "h");
}

/** Step title with a numbered bubble. */
function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-red-600 to-red-400 text-xs font-bold text-white">
        {n}
      </span>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

/** A burst of confetti when a booking goes through (pure CSS; positions are fixed, so it never changes between renders). */
function Confetti() {
  return (
    <div className="confetti pointer-events-none" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2;
        const dist = 90 + (i % 5) * 24;
        return (
          <span
            key={i}
            style={
              {
                "--x": `${Math.round(Math.cos(angle) * dist)}px`,
                "--y": `${Math.round(Math.sin(angle) * dist - 50)}px`,
                "--r": `${(i * 47) % 360}deg`,
                "--c": CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                "--d": `${(i % 7) * 25}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

export default function CourtBoard({ mode }: { mode: Mode }) {
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: DAYS_SHOWN }, (_, i) => localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  }, []);
  const [day, setDay] = useState(days[0]);
  const [courts, setCourts] = useState<BoardCourt[] | null>(null);
  const [kind, setKind] = useState<CourtKind | null>(null);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    const r = await call(`/api/courts?date=${day}`);
    if (!r.ok) {
      setError(r.data.error ?? "Không tải được lịch sân.");
      return;
    }
    const list: BoardCourt[] = r.data.courts;
    setCourts(list);
    setError(null);
    // The first time: if the sport shown is not lent out today, start on the next day it is.
    if (firstLoad.current) {
      firstLoad.current = false;
      const first = COURT_KINDS.find((k) => list.some((c) => c.kind === k.key))?.key;
      const ofKind = list.filter((c) => c.kind === first);
      if (ofKind.length > 0 && !ofKind.some((c) => c.open)) {
        const next = days.find((k) => ofKind.some((c) => c.openDays.includes(dayOfKey(k))));
        if (next && next !== day) setDay(next);
      }
    }
  }, [day, days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const kinds = COURT_KINDS.filter((k) => courts?.some((c) => c.kind === k.key));
  const activeKind = kind && kinds.some((k) => k.key === kind) ? kind : (kinds[0]?.key ?? null);
  const kindCourts = (courts ?? []).filter((c) => c.kind === activeKind);
  const court = kindCourts.find((c) => c.id === courtId) ?? kindCourts.find((c) => c.open) ?? kindCourts[0] ?? null;
  const slot = court?.slots.find((s) => s.id === slotId) ?? null;
  const kindDays = Array.from(new Set(kindCourts.flatMap((c) => c.openDays)));
  const kindHours = kindCourts[0]?.slots.map((s) => `${hour(s.startTime)}–${hour(s.endTime)}`).join(", ");

  /** Is the chosen sport lent out on this day? (Everything is "open" until the courts have loaded.) */
  const dayOpen = (k: string) => kindCourts.length === 0 || kindCourts.some((c) => c.openDays.includes(dayOfKey(k)));

  function pickKind(next: CourtKind) {
    setKind(next);
    setCourtId(null);
    setSlotId(null);
    setNotice(null);
    const ofKind = (courts ?? []).filter((c) => c.kind === next);
    // Jump to the next lending day when the sport does not run on the day being looked at.
    if (ofKind.length > 0 && !ofKind.some((c) => c.openDays.includes(dayOfKey(day)))) {
      const to = days.find((k) => ofKind.some((c) => c.openDays.includes(dayOfKey(k))));
      if (to) setDay(to);
    }
  }

  function pickDay(k: string) {
    setDay(k);
    setSlotId(null);
    setNotice(null);
    setError(null);
  }

  async function book() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    const r = await post("/api/courts/bookings", { slotId: slot.id, date: day, note: note.trim() || undefined });
    setBusy(false);
    if (!r.ok) {
      setError(r.data.error ?? "Không đặt được.");
      load();
      return;
    }
    setNotice(
      r.data.status === "PENDING"
        ? "Đã gửi yêu cầu! Lượt đặt có hiệu lực sau khi Liên chi đoàn duyệt."
        : r.data.status === "UNION_APPROVED"
          ? "Đã gửi quản lý sân để duyệt."
          : "Đặt sân thành công! Hẹn gặp bạn trên sân.",
    );
    setCelebrate((n) => n + 1);
    setSlotId(null);
    setNote("");
    load();
  }

  async function cancel(id: string) {
    const r = await call(`/api/courts/bookings/${id}`, { method: "DELETE" });
    if (!r.ok) setError(r.data.error ?? "Không hủy được.");
    else setNotice("Đã hủy lượt đặt.");
    load();
  }

  return (
    <div className="space-y-6 pb-28">
      {celebrate > 0 && <Confetti key={celebrate} />}

      {/* Hero: what can be rented and when */}
      <div className="court-hero rounded-3xl p-5 text-white shadow-lg">
        <p className="text-xs font-medium uppercase tracking-wide text-white/80">Đặt sân Phân hiệu</p>
        <h2 className="mt-1 text-xl font-bold sm:text-2xl">Chọn sân, chọn ca, chơi thôi! 🎉</h2>
        {activeKind && kindDays.length > 0 && (
          <p className="mt-2 inline-block rounded-full bg-white/20 px-3 py-1 text-xs backdrop-blur">
            {COURT_KINDS.find((k) => k.key === activeKind)?.label}: cho thuê <b>{openDaysLabel(kindDays)}</b>
            {kindHours ? ` · ca ${kindHours}` : ""}
          </p>
        )}
      </div>

      {notice && (
        <div className="flex items-center gap-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800 animate-pop-in">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white" aria-hidden>
            ✓
          </span>
          {notice}
        </div>
      )}
      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600 animate-pop-in">{error}</p>}
      {courts === null && !error && <p className="text-sm text-slate-400">Đang tải sân...</p>}
      {courts?.length === 0 && <p className="text-sm text-slate-500">Chưa có sân nào mở đặt.</p>}

      {kinds.length > 0 && (
        <section>
          <Step n={1} title="Chọn môn" />
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {kinds.map((k) => (
              <button
                key={k.key}
                onClick={() => pickKind(k.key)}
                className={`flex flex-shrink-0 items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  activeKind === k.key
                    ? "scale-105 bg-gradient-to-br from-red-600 to-red-500 text-white shadow-md"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:-translate-y-0.5 hover:ring-red-300"
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {k.icon}
                </span>
                {k.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {activeKind && (
        <section>
          <Step n={2} title="Chọn ngày" hint="Ngày mờ là sân nghỉ" />
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {days.map((k, i) => {
              const open = dayOpen(k);
              const on = day === k;
              const [, m, d] = k.split("-").map(Number);
              const wd = WEEKDAYS.find((w) => w.day === dayOfKey(k))!;
              return (
                <button
                  key={k}
                  onClick={() => pickDay(k)}
                  style={{ animationDelay: `${i * 25}ms` }}
                  className={`animate-rise-in flex w-16 flex-shrink-0 flex-col items-center rounded-2xl py-2 transition-all ${
                    on
                      ? "scale-105 bg-gradient-to-br from-red-600 to-red-500 text-white shadow-md"
                      : open
                        ? "bg-white text-slate-700 ring-1 ring-slate-200 hover:-translate-y-0.5 hover:ring-red-300"
                        : "bg-slate-50 text-slate-300 ring-1 ring-slate-100"
                  }`}
                >
                  <span className="text-[11px] font-medium opacity-80">{i === 0 ? "Hôm nay" : wd.short}</span>
                  <span className="text-lg font-bold leading-tight">{String(d).padStart(2, "0")}</span>
                  <span className="text-[10px] opacity-70">Th{m}</span>
                  <span className={`mt-1 h-1.5 w-1.5 rounded-full ${open ? (on ? "bg-white" : "bg-green-500") : "bg-transparent"}`} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {kindCourts.length > 0 && (
        <section>
          <Step n={3} title="Chọn sân" hint={`${fmtKey(day)}`} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {kindCourts.map((c, i) => {
              const free = c.slots.filter((s) => !s.booking && !s.past).length;
              const on = court?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setCourtId(c.id);
                    setSlotId(null);
                    setNotice(null);
                  }}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className={`court-card animate-pop-in rounded-3xl bg-white p-3 text-center transition-all ${
                    on ? "ring-2 ring-red-500 shadow-lg shadow-red-200/60" : "ring-1 ring-slate-200 hover:ring-red-300"
                  }`}
                >
                  <Court3D kind={c.kind} selected={on} closed={!c.open} />
                  <p className="mt-1 text-sm font-semibold text-slate-800">{c.name}</p>
                  <p
                    className={`mx-auto mt-1 w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      !c.open ? "bg-slate-100 text-slate-400" : free > 0 ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {!c.open ? "Nghỉ hôm nay" : free > 0 ? `${free} ca trống` : "Hết ca"}
                  </p>
                  {c.managerName && <p className="mt-1 text-[10px] text-slate-400">Quản lý: {c.managerName}</p>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {court && (
        <section>
          <Step n={4} title="Chọn ca" hint={court.name} />
          {!court.open ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 animate-pop-in">
              {court.name} không cho thuê vào {WEEKDAYS.find((w) => w.day === dayOfKey(day))?.label}. Sân cho thuê vào{" "}
              <b>{openDaysLabel(court.openDays)}</b>.
              <button
                onClick={() => {
                  const to = days.find((k) => court.openDays.includes(dayOfKey(k)));
                  if (to) pickDay(to);
                }}
                className="ml-2 font-semibold text-red-600 underline"
              >
                Xem ngày gần nhất
              </button>
            </div>
          ) : court.slots.length === 0 ? (
            <p className="text-sm text-slate-400">Sân chưa có ca nào.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {court.slots.map((s, i) => {
                const label = `${hour(s.startTime)} – ${hour(s.endTime)}`;
                const b = s.booking;
                const style = { animationDelay: `${i * 60}ms` };
                if (b) {
                  return (
                    <div
                      key={s.id}
                      style={style}
                      className={`animate-pop-in flex flex-col rounded-2xl px-4 py-3 text-sm ${
                        b.mine ? "bg-red-50 ring-2 ring-red-300" : "bg-slate-50 text-slate-400 ring-1 ring-slate-100"
                      }`}
                    >
                      <span className="text-base font-bold">{label}</span>
                      <span className="text-xs">
                        {b.mine ? `Của bạn · ${STATUS_LABEL[b.status]}` : b.who ? `${b.who} · ${STATUS_LABEL[b.status]}` : "Đã có người đặt"}
                      </span>
                      {b.mine && !s.past && (
                        <button onClick={() => cancel(b.id)} className="mt-1 w-fit text-xs font-semibold text-red-600 underline">
                          Hủy lượt đặt
                        </button>
                      )}
                    </div>
                  );
                }
                if (s.past || !mode) {
                  return (
                    <div key={s.id} style={style} className="animate-pop-in rounded-2xl bg-slate-50 px-4 py-3 text-slate-300 ring-1 ring-slate-100">
                      <span className="text-base font-bold">{label}</span>
                      <span className="block text-xs">{s.past ? "Đã qua" : "Trống"}</span>
                    </div>
                  );
                }
                const on = slotId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSlotId(s.id);
                      setNotice(null);
                      setError(null);
                    }}
                    style={style}
                    className={`animate-pop-in rounded-2xl px-4 py-3 text-left transition-all ${
                      on
                        ? "slot-pulse bg-gradient-to-br from-red-600 to-red-500 text-white shadow-lg"
                        : "bg-green-50 text-green-800 ring-1 ring-green-200 hover:-translate-y-0.5 hover:ring-green-400"
                    }`}
                  >
                    <span className="text-base font-bold">{label}</span>
                    <span className="block text-xs opacity-80">{on ? "Đã chọn ✓" : "Còn trống"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Booking bar: appears once a slot is picked */}
      {court && slot && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 animate-rise-in">
          <div className="mx-auto max-w-2xl rounded-3xl border border-red-200 bg-white/95 p-4 shadow-2xl backdrop-blur">
            <p className="text-sm text-slate-700">
              <b>{court.name}</b> · {fmtKey(day)} · {hour(slot.startTime)}–{hour(slot.endTime)}
            </p>
            {court.startsAs === "PENDING" && (
              <p className="text-xs text-amber-700">
                Lượt đặt sẽ gửi Liên chi đoàn duyệt{court.managerName ? `, rồi chuyển ${court.managerName} (quản lý sân) duyệt lần cuối` : ""}.
              </p>
            )}
            {court.startsAs === "UNION_APPROVED" && <p className="text-xs text-amber-700">Lượt đặt sẽ gửi quản lý sân duyệt.</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="Ghi chú / mục đích (không bắt buộc)"
                className={`${input} min-w-48 flex-1`}
              />
              <button onClick={book} disabled={busy} className={`${btnPrimary} rounded-full px-6 py-2`}>
                {busy ? "Đang đặt..." : court.startsAs === "APPROVED" ? "Đặt sân ngay" : "Gửi yêu cầu"}
              </button>
              <button onClick={() => setSlotId(null)} className={`${btnGhost} rounded-full`}>
                Thôi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
