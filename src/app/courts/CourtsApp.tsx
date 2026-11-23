"use client";

import { useCallback, useEffect, useState } from "react";
import { ALL_DAYS, COURT_KINDS, openDaysLabel, WEEKDAYS, type CourtKind } from "@/lib/court-kinds";
import CourtBoard from "./CourtBoard";
import { btnGhost, btnPrimary, call, fmtIso, input, patch, post, STATUS_LABEL, STATUS_STYLE, type Mode, type Status } from "./shared";

type Tab = "board" | "mine" | "approve" | "manage";

type MyBooking = {
  id: string;
  date: string;
  status: Status;
  note: string | null;
  decisionNote: string | null;
  court: { name: string; managerId: string | null; manager: { name: string } | null };
  slot: { startTime: string; endTime: string };
};
type PendingBooking = MyBooking & { user: { name: string; phone: string; major: string | null; className: string | null } };

type ManageCourt = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  kind: CourtKind;
  openDays: number[];
  manager: { id: string; name: string } | null;
  slots: { id: string; startTime: string; endTime: string; active: boolean }[];
};

export default function CourtsApp({
  mode,
  canApprove,
  canManage,
  canAddCourt,
}: {
  mode: Mode;
  canApprove: boolean;
  canManage: boolean;
  canAddCourt: boolean;
}) {
  const tabs: { key: Tab; label: string }[] = [
    ...(mode ? [{ key: "board" as Tab, label: "Đặt sân" }, { key: "mine" as Tab, label: "Lịch của tôi" }] : []),
    ...(canApprove ? [{ key: "approve" as Tab, label: "Duyệt đặt sân" }] : []),
    ...(canManage ? [{ key: "manage" as Tab, label: "Quản lý sân" }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.key ?? "board");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="sr-only">Đặt sân</h1>
        {mode === "approval" && (
          <p className="text-sm text-slate-500">Lượt đặt của sinh viên được gửi Liên chi đoàn duyệt. Sân có quản lý riêng (như sân bóng đá) thì Liên chi đoàn chuyển tiếp cho quản lý sân duyệt lần cuối.</p>
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
      {tab === "board" && <CourtBoard mode={mode} />}
      {tab === "mine" && <Mine />}
      {tab === "approve" && <Approvals />}
      {tab === "manage" && <Manage canAddCourt={canAddCourt} />}
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
          <p className="mt-1">
            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[b.status]}`}>{STATUS_LABEL[b.status]}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={() => decide(b.id, "approve")} disabled={busyId === b.id} className={btnPrimary}>
              {b.status === "PENDING" && b.court.managerId ? "Duyệt & chuyển quản lý sân" : "Duyệt"}
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
function Manage({ canAddCourt }: { canAddCourt: boolean }) {
  const [courts, setCourts] = useState<ManageCourt[] | null>(null);
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [newManager, setNewManager] = useState("");
  const [newKind, setNewKind] = useState<CourtKind>("BADMINTON");
  const [newDays, setNewDays] = useState<number[]>(ALL_DAYS);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slotText, setSlotText] = useState("17:00-18:00, 18:00-19:00, 19:00-20:00");
  const [newSlot, setNewSlot] = useState<Record<string, { start: string; end: string }>>({});

  const load = useCallback(async () => {
    const r = await call("/api/courts/manage");
    if (r.ok) {
      setCourts(r.data.courts);
      setManagers(r.data.managers);
      setCanAssign(r.data.canAssign);
    }
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
    const ok = await act(post("/api/courts/manage", { name, description: description || undefined, managerId: newManager || null, kind: newKind, openDays: newDays, slots }));
    if (ok) {
      setName("");
      setDescription("");
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {canAddCourt && (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-800">Thêm sân</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên sân (VD: Sân cầu lông số 1)" maxLength={80} className={input} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả (không bắt buộc)" maxLength={200} className={input} />
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-600">
            Loại sân
            <select value={newKind} onChange={(e) => setNewKind(e.target.value as CourtKind)} className={`${input} mt-1 block`}>
              {COURT_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  {k.icon} {k.label}
                </option>
              ))}
            </select>
          </label>
          <DayPicker value={newDays} onChange={setNewDays} />
        </div>
        {canAssign && (
          <label className="mt-2 block text-xs font-medium text-slate-600">
            Người quản lý sân (để trống nếu do Liên chi đoàn quản lý)
            <select value={newManager} onChange={(e) => setNewManager(e.target.value)} className={`${input} mt-1 block w-full sm:w-72`}>
              <option value="">Liên chi đoàn quản lý</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="mt-2 block text-xs font-medium text-slate-600">
          Các ca (giờ bắt đầu-giờ kết thúc, cách nhau bằng dấu phẩy)
          <input value={slotText} onChange={(e) => setSlotText(e.target.value)} className={`${input} mt-1 block w-full`} />
        </label>
        <button onClick={addCourt} disabled={!name.trim()} className={`${btnPrimary} mt-3`}>
          Thêm sân
        </button>
      </section>
      )}

      {courts === null && !error && <p className="text-sm text-slate-400">Đang tải...</p>}
      {courts?.map((c) => {
        const ns = newSlot[c.id] ?? { start: "", end: "" };
        return (
          <section key={c.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${c.active ? "border-slate-200" : "border-slate-200 opacity-70"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-800">{c.name}</h2>
              {!c.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Tạm ngưng</span>}
              <span className="text-xs text-slate-500">{c.description}</span>
              {canAssign ? (
                <select
                  value={c.manager?.id ?? ""}
                  onChange={(e) => act(patch(`/api/courts/manage/${c.id}`, { managerId: e.target.value || null }))}
                  className={input}
                  aria-label="Người quản lý sân"
                >
                  <option value="">Liên chi đoàn quản lý</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      Quản lý: {m.name}
                    </option>
                  ))}
                </select>
              ) : (
                c.manager && <span className="text-xs text-slate-500">Quản lý: {c.manager.name}</span>
              )}
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
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs font-medium text-slate-600">
                Loại sân
                <select
                  value={c.kind}
                  onChange={(e) => act(patch(`/api/courts/manage/${c.id}`, { kind: e.target.value }))}
                  className={`${input} mt-1 block`}
                >
                  {COURT_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.icon} {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <DayPicker value={c.openDays} onChange={(days) => act(patch(`/api/courts/manage/${c.id}`, { openDays: days }))} />
              <span className="text-xs text-slate-400">Cho thuê: {openDaysLabel(c.openDays)}</span>
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

/** Tick the weekdays a court is lent out. */
function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-600">Ngày cho thuê</p>
      <div className="mt-1 flex gap-1">
        {WEEKDAYS.map((w) => {
          const on = value.includes(w.day);
          return (
            <button
              key={w.day}
              type="button"
              onClick={() => {
                const next = on ? value.filter((d) => d !== w.day) : [...value, w.day];
                if (next.length > 0) onChange(next);
              }}
              aria-pressed={on}
              title={w.label}
              className={`h-8 w-9 rounded-lg text-xs font-semibold transition-colors ${
                on ? "bg-red-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-300 hover:ring-red-300"
              }`}
            >
              {w.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
