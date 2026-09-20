"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "@/lib/client-session-rules";

type MealPattern = "LUNCH" | "DINNER" | "BOTH";

type StudentRow = {
  id: string;
  name: string;
  phone: string;
  orderCode: number | null;
  group: string | null;
  mustChangePassword: boolean;
  active: boolean;
  remaining: number;
  lowMeal: boolean;
  latestRegistration: {
    id: string;
    startDate: string;
    totalSessions: number;
    mealPattern: MealPattern;
    pricePerMeal: number;
  } | null;
};

type StudentDetail = {
  id: string;
  name: string;
  phone: string;
  registrations: {
    id: string;
    startDate: string;
    totalSessions: number;
    mealPattern: MealPattern;
    pricePerMeal: number;
    note: string | null;
  }[];
  sessions: {
    id: string;
    date: string;
    mealType: "LUNCH" | "DINNER";
    status: string;
    pickedUp: boolean;
    note: string | null;
  }[];
};

const PATTERN_LABEL: Record<MealPattern, string> = { LUNCH: "Trưa", DINNER: "Tối", BOTH: "Trưa & Tối" };
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
function fmtDate(iso: string) {
  return dateFmt.format(new Date(iso));
}

const emptyForm = {
  name: "",
  phone: "",
  group: "",
  startDate: localDateKey(new Date()),
  totalSessions: 14,
  mealPattern: "BOTH" as MealPattern,
  pricePerMeal: 25000,
  note: "",
};

export default function SalesTools() {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);

  const [editingOrderCodeId, setEditingOrderCodeId] = useState<string | null>(null);
  const [orderCodeDraft, setOrderCodeDraft] = useState("");
  const [orderCodeError, setOrderCodeError] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState("");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  async function loadStudents(q = "") {
    setLoadingList(true);
    try {
      const res = await fetch(`/api/students?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok) setStudents(data.students);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    loadStudents();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadStudents(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Không thể tạo đăng ký.");
        return;
      }
      setFormSuccess(`Đã đăng ký ${form.totalSessions} suất ăn cho ${form.name}.`);
      setForm({ ...emptyForm, startDate: emptyForm.startDate });
      loadStudents(search);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    const res = await fetch(`/api/students/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  function startEditOrderCode(s: StudentRow) {
    setEditingOrderCodeId(s.id);
    setOrderCodeDraft(s.orderCode != null ? String(s.orderCode) : "");
    setOrderCodeError(null);
  }

  async function saveOrderCode(id: string) {
    setOrderCodeError(null);
    const trimmed = orderCodeDraft.trim();
    const orderCode = trimmed === "" ? null : Number(trimmed);
    if (orderCode !== null && (!Number.isInteger(orderCode) || orderCode < 1)) {
      setOrderCodeError("Mã số phải là số nguyên dương.");
      return;
    }
    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderCode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setOrderCodeError(data.error ?? "Không thể lưu mã số.");
      return;
    }
    setEditingOrderCodeId(null);
    loadStudents(search);
  }

  function startEditGroup(s: StudentRow) {
    setEditingGroupId(s.id);
    setGroupDraft(s.group ?? "");
  }

  async function saveGroup(id: string) {
    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: groupDraft.trim() || null }),
    });
    if (res.ok) {
      setEditingGroupId(null);
      loadStudents(search);
    }
  }

  async function resetOrderCodes() {
    setResetting(true);
    try {
      await fetch("/api/students/reset-order-codes", { method: "POST" });
      setConfirmingReset(false);
      loadStudents(search);
    } finally {
      setResetting(false);
    }
  }

  async function backfillOrderCodes() {
    setBackfilling(true);
    setBackfillMessage(null);
    try {
      const res = await fetch("/api/students/backfill-order-codes", { method: "POST" });
      const data = await res.json();
      setBackfillMessage(
        res.ok
          ? data.count > 0
            ? `Đã gán mã cho ${data.count} sinh viên chưa có mã.`
            : "Mọi sinh viên đều đã có mã."
          : (data.error ?? "Không thể gán mã."),
      );
      loadStudents(search);
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Đăng ký suất ăn cho sinh viên</h2>
        <form
          onSubmit={onSubmit}
          className="bg-white border border-slate-200 border-t-4 border-t-red-500 rounded-xl p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-rise-in"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tên sinh viên</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Số điện thoại</label>
            <input
              required
              inputMode="numeric"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="09xxxxxxxx"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tổ (tùy chọn)</label>
            <input
              value={form.group}
              onChange={(e) => setForm({ ...form, group: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="VD: Tổ 1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ngày bắt đầu</label>
            <input
              required
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Số buổi ăn</label>
            <input
              required
              type="number"
              min={1}
              max={200}
              value={form.totalSessions}
              onChange={(e) => setForm({ ...form, totalSessions: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bữa ăn</label>
            <select
              value={form.mealPattern}
              onChange={(e) => setForm({ ...form, mealPattern: e.target.value as MealPattern })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              <option value="LUNCH">Trưa</option>
              <option value="DINNER">Tối</option>
              <option value="BOTH">Trưa &amp; Tối</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Giá mỗi suất (VNĐ)</label>
            <input
              required
              type="number"
              min={0}
              step={1000}
              value={form.pricePerMeal}
              onChange={(e) => setForm({ ...form, pricePerMeal: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú (tùy chọn)</label>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
              placeholder="Ví dụ: ăn chay, dị ứng hải sản..."
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              {submitting ? "Đang lưu..." : "Đăng ký"}
            </button>
            {formError && <p className="text-sm text-red-600 animate-pop-in">{formError}</p>}
            {formSuccess && <p className="text-sm text-green-600 animate-pop-in">{formSuccess}</p>}
          </div>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">Danh sách sinh viên</h2>
          <div className="flex items-center gap-2">
            {confirmingReset ? (
              <>
                <span className="text-xs text-red-600">Xóa mã số của tất cả sinh viên?</span>
                <button
                  onClick={resetOrderCodes}
                  disabled={resetting}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:opacity-50 animate-pop-in"
                >
                  {resetting ? "Đang reset..." : "Xác nhận reset"}
                </button>
                <button
                  onClick={() => setConfirmingReset(false)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 animate-pop-in"
                >
                  Thôi
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingReset(true)}
                className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                title="Xóa mã thứ tự của tất cả sinh viên để bắt đầu kỳ học mới"
              >
                Reset mã thứ tự
              </button>
            )}
            <button
              onClick={backfillOrderCodes}
              disabled={backfilling}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              title="Gán mã thứ tự cho các sinh viên hiện chưa có mã (tài khoản tạo trước khi có tính năng này)"
            >
              {backfilling ? "Đang gán..." : "Gán mã cho SV chưa có mã"}
            </button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc số điện thoại..."
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-64 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>
        {backfillMessage && <p className="text-xs text-slate-500 mb-2">{backfillMessage}</p>}
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {loadingList && <p className="p-4 text-sm text-slate-400">Đang tải...</p>}
          {!loadingList && students.length === 0 && (
            <p className="p-4 text-sm text-slate-400">Chưa có sinh viên nào.</p>
          )}
          {students.map((s, i) => (
            <div key={s.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <div className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-red-50/40 transition-colors">
                {editingOrderCodeId === s.id ? (
                  <div className="sm:w-32 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="number"
                        min={1}
                        value={orderCodeDraft}
                        onChange={(e) => setOrderCodeDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveOrderCode(s.id);
                          if (e.key === "Escape") setEditingOrderCodeId(null);
                        }}
                        className="w-14 rounded-lg border border-red-300 px-1.5 py-1 text-sm outline-none focus:ring-2 focus:ring-red-100"
                      />
                      <button onClick={() => saveOrderCode(s.id)} className="text-green-600 hover:text-green-700 text-sm" title="Lưu">
                        ✓
                      </button>
                      <button
                        onClick={() => setEditingOrderCodeId(null)}
                        className="text-slate-400 hover:text-slate-600 text-sm"
                        title="Hủy"
                      >
                        ✕
                      </button>
                    </div>
                    {orderCodeError && <p className="text-[11px] text-red-600 mt-0.5">{orderCodeError}</p>}
                  </div>
                ) : (
                  <button
                    onClick={() => startEditOrderCode(s)}
                    title="Bấm để sửa mã số"
                    className={`sm:w-16 flex-shrink-0 text-left text-sm font-mono font-semibold rounded-lg px-2 py-1 hover:bg-red-50 ${
                      s.orderCode != null ? "text-red-700" : "text-slate-300"
                    }`}
                  >
                    {s.orderCode ?? "—"}
                  </button>
                )}
                <div className="sm:w-56">
                  <p className={`text-sm font-medium ${s.lowMeal ? "text-red-600" : "text-slate-800"}`}>
                    {s.name}
                    {s.lowMeal && " ⚠"}
                  </p>
                  <p className="text-xs text-slate-400">{s.phone}</p>
                </div>
                {editingGroupId === s.id ? (
                  <div className="flex items-center gap-1 sm:w-24 flex-shrink-0">
                    <input
                      autoFocus
                      value={groupDraft}
                      onChange={(e) => setGroupDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveGroup(s.id);
                        if (e.key === "Escape") setEditingGroupId(null);
                      }}
                      placeholder="Tổ"
                      className="w-16 rounded-lg border border-red-300 px-1.5 py-1 text-sm outline-none focus:ring-2 focus:ring-red-100"
                    />
                    <button onClick={() => saveGroup(s.id)} className="text-green-600 hover:text-green-700 text-sm" title="Lưu">
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingGroupId(null)}
                      className="text-slate-400 hover:text-slate-600 text-sm"
                      title="Hủy"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEditGroup(s)}
                    title="Bấm để sửa tổ"
                    className={`sm:w-24 flex-shrink-0 text-left text-sm rounded-lg px-2 py-1 hover:bg-red-50 ${
                      s.group ? "text-slate-700" : "text-slate-300"
                    }`}
                  >
                    {s.group || "— tổ —"}
                  </button>
                )}
                <div className="text-sm text-slate-600 flex-1">
                  {s.latestRegistration ? (
                    <span>
                      {PATTERN_LABEL[s.latestRegistration.mealPattern]} &middot; {s.latestRegistration.totalSessions} buổi
                      &middot; {currency.format(s.latestRegistration.pricePerMeal)} &middot; từ {fmtDate(s.latestRegistration.startDate)}
                    </span>
                  ) : (
                    <span className="text-slate-400">Chưa có đăng ký</span>
                  )}
                </div>
                <div className={`text-sm font-medium ${s.lowMeal ? "text-red-600" : "text-slate-700"}`}>
                  Còn {s.remaining} buổi
                </div>
                {s.mustChangePassword && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Chưa đổi MK</span>
                )}
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  {expandedId === s.id ? "Đóng" : "Chi tiết"}
                </button>
              </div>
              {expandedId === s.id && (
                <div className="bg-red-50/50 px-4 py-3 text-sm animate-rise-in">
                  {!detail && <p className="text-slate-400">Đang tải chi tiết...</p>}
                  {detail && (
                    <div className="space-y-2">
                      <p className="font-medium text-slate-700">Các đợt đăng ký</p>
                      <ul className="list-disc pl-5 text-slate-600">
                        {detail.registrations.map((r) => (
                          <li key={r.id}>
                            {r.totalSessions} buổi ({PATTERN_LABEL[r.mealPattern]}), {currency.format(r.pricePerMeal)}/suất,
                            bắt đầu {fmtDate(r.startDate)}
                            {r.note ? ` — ${r.note}` : ""}
                          </li>
                        ))}
                      </ul>
                      <p className="font-medium text-slate-700 mt-2">Lịch buổi ăn</p>
                      <ul className="list-disc pl-5 max-h-40 overflow-y-auto">
                        {[...detail.sessions]
                          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                          .map((sx) => (
                            <li
                              key={sx.id}
                              className={
                                sx.status === "CANCELLED"
                                  ? "text-slate-400 line-through"
                                  : sx.pickedUp
                                    ? "text-green-600"
                                    : sx.status === "COMPLETED"
                                      ? "text-amber-600"
                                      : "text-slate-600"
                              }
                            >
                              {fmtDate(sx.date)} &middot; {sx.mealType === "LUNCH" ? "Trưa" : "Tối"}
                              {sx.status === "CANCELLED"
                                ? " (đã hủy)"
                                : sx.pickedUp
                                  ? " (đã ăn)"
                                  : sx.status === "COMPLETED"
                                    ? " (chưa lấy)"
                                    : ""}
                              {sx.note ? ` — ${sx.note}` : ""}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
