"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { localDateKey } from "@/lib/client-session-rules";

type Mode = "approval" | "instant" | null;
type Tab = "board" | "mine" | "approve" | "manage";
type Status = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

type BoardSlot = {
  id: string;
  startTime: string;
  endTime: string;
  past: boolean;
  booking: { id: string; status: Status; mine: boolean; who: string | null; note: string | null } | null;
};
type BoardCourt = { id: string; name: string; description: string | null; slots: BoardSlot[] };

type MyBooking = {
  id: string;
  date: string;
  status: Status;
  note: string | null;
  decisionNote: string | null;
  court: { name: string };
  slot: { startTime: string; endTime: string };
};
type PendingBooking = MyBooking & { user: { name: string; phone: string; major: string | null; className: string | null } };

type ManageCourt = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  slots: { id: string; startTime: string; endTime: string; active: boolean }[];
};

const DAYS_SHOWN = 15;
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
  CANCELLED: "Đã hủy",
};
const STATUS_STYLE: Record<Status, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

const input =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100";
const btnPrimary = "rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50";
const btnGhost = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50";

function fmtKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
function fmtIso(iso: string) {
  return fmtKey(localDateKey(new Date(iso)));
}

async function call(path: string, init?: RequestInit) {
  try {
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data } as { ok: boolean; data: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch {
    return { ok: false, data: { error: "Không kết nối được máy chủ, thử lại." } } as { ok: boolean; data: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
const post = (path: string, body: unknown) =>
  call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patch = (path: string, body: unknown) =>
  call(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function CourtsApp({ mode, canApprove, canManage }: { mode: Mode; canApprove: boolean; canManage: boolean }) {
  const tabs: { key: Tab; label: string }[] = [
    ...(mode ? [{ key: "board" as Tab, label: "Đặt sân" }, { key: "mine" as Tab, label: "Lịch của tôi" }] : []),
    ...(canApprove ? [{ key: "approve" as Tab, label: "Duyệt đặt sân" }] : []),
    ...(canManage ? [{ key: "manage" as Tab, label: "Quản lý sân" }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? "board");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Đặt sân</h1>
        {mode === "approval" && (
          <p className="text-sm text-slate-500">Lượt đặt của sinh viên được gửi cho Liên chi đoàn duyệt trước khi có hiệu lực.</p>
        )}
      </div>
      {tabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${
                tab === t.key ? "bg-red-600 font-semibold text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-red-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {tab === "board" && <Board mode={mode} />}
      {tab === "mine" && <Mine />}
      {tab === "approve" && <Approvals />}
      {tab === "manage" && <Manage />}
    </div>
  );
}

// ------------------------------------------------------------------ the booking board of one day
function Board({ mode }: { mode: Mode }) {
  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: DAYS_SHOWN }, (_, i) => localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  }, []);
  const [day, setDay] = useState(days[0]);
  const [courts, setCourts] = useState<BoardCourt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pick, setPick] = useState<{ court: BoardCourt; slot: BoardSlot } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await call(`/api/courts?date=${day}`);
    if (r.ok) {
      setCourts(r.data.courts);
      setError(null);
    } else setError(r.data.error ?? "Không tải được lịch sân.");
  }, [day]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function book() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    const r = await post("/api/courts/bookings", { slotId: pick.slot.id, date: day, note: note.trim() || undefined });
    setBusy(false);
    if (!r.ok) {
      setError(r.data.error ?? "Không đặt được.");
      load();
      return;
    }
    setNotice(
      r.data.status === "PENDING"
        ? "Đã gửi yêu cầu đặt sân. Lượt đặt có hiệu lực sau khi Liên chi đoàn duyệt."
        : "Đã đặt sân thành công.",
    );
    setPick(null);
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
    <div className="space-y-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {days.map((k) => (
          <button
            key={k}
            onClick={() => {
              setDay(k);
              setPick(null);
              setNotice(null);
            }}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm ${
              day === k ? "bg-red-600 font-semibold text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-red-50"
            }`}
          >
            {fmtKey(k)}
          </button>
        ))}
      </div>

      {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {courts === null && !error && <p className="text-sm text-slate-400">Đang tải...</p>}
      {courts?.length === 0 && <p className="text-sm text-slate-500">Chưa có sân nào mở đặt.</p>}

      {courts?.map((c) => (
        <section key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-semibold text-slate-800">{c.name}</h2>
          {c.description && <p className="text-xs text-slate-500">{c.description}</p>}
          {c.slots.length === 0 && <p className="mt-2 text-sm text-slate-400">Sân chưa có ca nào.</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {c.slots.map((s) => {
              const label = `${s.startTime} – ${s.endTime}`;
              if (s.booking) {
                const b = s.booking;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
                      b.mine ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    <span>
                      <span className="font-medium">{label}</span>
                      <span className="block text-xs">
                        {b.mine ? `Của bạn · ${STATUS_LABEL[b.status]}` : b.who ? `${b.who} · ${STATUS_LABEL[b.status]}` : "Đã có người đặt"}
                      </span>
                    </span>
                    {b.mine && !s.past && (
                      <button onClick={() => cancel(b.id)} className="text-xs font-medium text-red-600 underline">
                        Hủy
                      </button>
                    )}
                  </div>
                );
              }
              if (s.past || !mode) {
                return (
                  <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
                    <span className="font-medium">{label}</span>
                    <span className="block text-xs">{s.past ? "Đã qua" : "Trống"}</span>
                  </div>
                );
              }
              const on = pick?.slot.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setPick({ court: c, slot: s });
                    setNotice(null);
                    setError(null);
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    on ? "border-red-500 bg-red-600 text-white shadow-sm" : "border-green-200 bg-green-50 text-green-800 hover:border-green-400"
                  }`}
                >
                  <span className="font-medium">{label}</span>
                  <span className="block text-xs">Trống</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {pick && (
        <div className="sticky bottom-3 rounded-2xl border border-red-200 bg-white p-4 shadow-lg animate-pop-in">
          <p className="text-sm text-slate-700">
            Đặt <b>{pick.court.name}</b>, {pick.slot.startTime} – {pick.slot.endTime}, {fmtKey(day)}
          </p>
          {mode === "approval" && <p className="text-xs text-amber-700">Lượt đặt sẽ được gửi Liên chi đoàn duyệt.</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Ghi chú / mục đích (không bắt buộc)"
              className={`${input} min-w-52 flex-1`}
            />
            <button onClick={book} disabled={busy} className={btnPrimary}>
              {busy ? "Đang đặt..." : mode === "approval" ? "Gửi yêu cầu" : "Đặt sân"}
            </button>
            <button onClick={() => setPick(null)} className={btnGhost}>
              Thôi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ my bookings
function Mine() {
  const [rows, setRows] = useState<MyBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call("/api/courts/bookings?scope=mine");
    if (r.ok) setRows(r.data);
    else setError(r.data.error ?? "Không tải được.");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function cancel(id: string) {
    const r = await call(`/api/courts/bookings/${id}`, { method: "DELETE" });
    setError(r.ok ? null : (r.data.error ?? "Không hủy được."));
    load();
  }

  if (rows === null) return <p className="text-sm text-slate-400">{error ?? "Đang tải..."}</p>;
  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-slate-500">Bạn chưa đặt sân nào.</p>}
      {rows.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <span className="font-medium text-slate-800">{b.court.name}</span>
          <span>
            {fmtIso(b.date)} · {b.slot.startTime} – {b.slot.endTime}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
          {b.decisionNote && <span className="text-xs text-slate-500">Lý do: {b.decisionNote}</span>}
          {b.note && <span className="text-xs text-slate-400">{b.note}</span>}
          {(b.status === "PENDING" || b.status === "APPROVED") && (
            <button onClick={() => cancel(b.id)} className="ml-auto text-xs font-medium text-red-600 underline">
              Hủy lượt đặt
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ approvals (union, admin)
function Approvals() {
  const [rows, setRows] = useState<PendingBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call("/api/courts/bookings?scope=pending");
    if (r.ok) setRows(r.data);
    else setError(r.data.error ?? "Không tải được.");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    const r = await patch(`/api/courts/bookings/${id}`, { decision, reason: reasons[id]?.trim() || undefined });
    setBusyId(null);
    setError(r.ok ? null : (r.data.error ?? "Không xử lý được."));
    load();
  }

  if (rows === null) return <p className="text-sm text-slate-400">{error ?? "Đang tải..."}</p>;
  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {rows.length === 0 && <p className="text-sm text-slate-500">Không có lượt đặt nào đang chờ duyệt.</p>}
      {rows.map((b) => (
        <div key={b.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-slate-800">{b.user.name}</span>
            <span className="text-xs text-slate-500">
              {[b.user.className, b.user.major].filter(Boolean).join(" · ")} {b.user.phone}
            </span>
          </div>
          <p className="mt-1">
            <b>{b.court.name}</b> · {fmtIso(b.date)} · {b.slot.startTime} – {b.slot.endTime}
            {b.note ? <span className="text-slate-500"> · {b.note}</span> : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={() => decide(b.id, "approve")} disabled={busyId === b.id} className={btnPrimary}>
              Duyệt
            </button>
            <input
              value={reasons[b.id] ?? ""}
              onChange={(e) => setReasons({ ...reasons, [b.id]: e.target.value })}
              placeholder="Lý do (nếu từ chối)"
              maxLength={200}
              className={`${input} min-w-40 flex-1`}
            />
            <button onClick={() => decide(b.id, "reject")} disabled={busyId === b.id} className={btnGhost}>
              Từ chối
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ set up courts and slots (admin)
function Manage() {
  const [courts, setCourts] = useState<ManageCourt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slotText, setSlotText] = useState("17:00-18:00, 18:00-19:00, 19:00-20:00");
  const [newSlot, setNewSlot] = useState<Record<string, { start: string; end: string }>>({});

  const load = useCallback(async () => {
    const r = await call("/api/courts/manage");
    if (r.ok) setCourts(r.data);
    else setError(r.data.error ?? "Không tải được.");
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(p: Promise<{ ok: boolean; data: { error?: string } }>) {
    const r = await p;
    setError(r.ok ? null : (r.data.error ?? "Không thực hiện được."));
    load();
    return r.ok;
  }

  async function addCourt() {
    const slots = slotText
      .split(/[,\n;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => {
        const [startTime, endTime] = t.split("-").map((x) => x.trim());
        return { startTime, endTime };
      });
    const ok = await act(post("/api/courts/manage", { name, description: description || undefined, slots }));
    if (ok) {
      setName("");
      setDescription("");
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-800">Thêm sân</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên sân (VD: Sân cầu lông số 1)" maxLength={80} className={input} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả (không bắt buộc)" maxLength={200} className={input} />
        </div>
        <label className="mt-2 block text-xs font-medium text-slate-600">
          Các ca (giờ bắt đầu-giờ kết thúc, cách nhau bằng dấu phẩy)
          <input value={slotText} onChange={(e) => setSlotText(e.target.value)} className={`${input} mt-1 block w-full`} />
        </label>
        <button onClick={addCourt} disabled={!name.trim()} className={`${btnPrimary} mt-3`}>
          Thêm sân
        </button>
      </section>

      {courts === null && !error && <p className="text-sm text-slate-400">Đang tải...</p>}
      {courts?.map((c) => {
        const ns = newSlot[c.id] ?? { start: "", end: "" };
        return (
          <section key={c.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${c.active ? "border-slate-200" : "border-slate-200 opacity-70"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-800">{c.name}</h2>
              {!c.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Tạm ngưng</span>}
              <span className="text-xs text-slate-500">{c.description}</span>
              <span className="ml-auto flex gap-2">
                <button onClick={() => act(patch(`/api/courts/manage/${c.id}`, { active: !c.active }))} className={btnGhost}>
                  {c.active ? "Tạm ngưng" : "Mở lại"}
                </button>
                <button
                  onClick={() => window.confirm(`Xóa sân "${c.name}"?`) && act(call(`/api/courts/manage/${c.id}`, { method: "DELETE" }))}
                  className={btnGhost}
                >
                  Xóa
                </button>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.slots.length === 0 && <span className="text-sm text-slate-400">Chưa có ca nào.</span>}
              {c.slots.map((s) => (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                    s.active ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-50 text-slate-400 line-through"
                  }`}
                >
                  {s.startTime} – {s.endTime}
                  <button
                    onClick={() => act(patch(`/api/courts/manage/${c.id}/slots`, { slotId: s.id, active: !s.active }))}
                    className="text-xs text-slate-500 underline"
                  >
                    {s.active ? "Tắt" : "Bật"}
                  </button>
                  <button
                    onClick={() => act(call(`/api/courts/manage/${c.id}/slots?slotId=${s.id}`, { method: "DELETE" }))}
                    className="text-xs text-red-600 underline"
                  >
                    Xóa
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="time" value={ns.start} onChange={(e) => setNewSlot({ ...newSlot, [c.id]: { ...ns, start: e.target.value } })} className={input} />
              <span className="text-slate-400">–</span>
              <input type="time" value={ns.end} onChange={(e) => setNewSlot({ ...newSlot, [c.id]: { ...ns, end: e.target.value } })} className={input} />
              <button
                disabled={!ns.start || !ns.end}
                onClick={async () => {
                  if (await act(post(`/api/courts/manage/${c.id}/slots`, { startTime: ns.start, endTime: ns.end }))) {
                    setNewSlot({ ...newSlot, [c.id]: { start: "", end: "" } });
                  }
                }}
                className={btnGhost}
              >
                + Thêm ca
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
