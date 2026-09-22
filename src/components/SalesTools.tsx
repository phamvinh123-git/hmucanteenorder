"use client";

import PageHeader from "@/components/PageHeader";
import { useEffect, useRef, useState } from "react";
import { localDateKey, LOW_MEAL_THRESHOLD } from "@/lib/client-session-rules";
import { classLevelsFor, MAJORS } from "@/lib/student-info";
import ConfirmModal from "@/components/ConfirmModal";

type MealPattern = "LUNCH" | "DINNER" | "BOTH";

type StudentRow = {
  id: string;
  name: string;
  phone: string;
  orderCode: number | null;
  major: string | null;
  className: string | null;
  mustChangePassword: boolean;
  active: boolean;
  remaining: number;
  lastSessionDate: string | null;
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

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-300 hover:border-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-100";
const labelCls = "mb-1.5 block text-xs font-semibold text-slate-600";
const chipCls = (active: boolean) =>
  `rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
    active
      ? "border-red-600 bg-red-600 text-white"
      : "border-slate-200 bg-white text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
  }`;
const SESSION_PRESETS = [7, 14, 28, 56];
const PRICE_PRESETS = [30000, 40000];
const MEAL_OPTIONS: [MealPattern, string][] = [
  ["LUNCH", "Trưa"],
  ["DINNER", "Tối"],
  ["BOTH", "Trưa & Tối"],
];

/** Earliest sensible start for a renewal: today, or the day after the student's last booked meal. */
function renewStartDate(lastSessionDate: string | null) {
  const today = localDateKey(new Date());
  if (!lastSessionDate) return today;
  const next = new Date(lastSessionDate);
  next.setDate(next.getDate() + 1);
  const nextKey = localDateKey(next);
  return nextKey > today ? nextKey : today;
}

/** Lunch is over after 14:00, so a "start today" registration then begins with dinner. */
function defaultStartMeal(dateKey: string): "LUNCH" | "DINNER" {
  return dateKey === localDateKey(new Date()) && new Date().getHours() >= 14 ? "DINNER" : "LUNCH";
}

const emptyForm = {
  startMeal: defaultStartMeal(localDateKey(new Date())) as "LUNCH" | "DINNER",
  name: "",
  phone: "",
  major: "",
  className: "",
  startDate: localDateKey(new Date()),
  totalSessions: 14,
  mealPattern: "BOTH" as MealPattern,
  pricePerMeal: 30000,
  note: "",
};

export default function SalesTools({ canResetAll = false }: { canResetAll?: boolean }) {
  const [showResetAll, setShowResetAll] = useState(false);
  const [resettingAll, setResettingAll] = useState(false);
  const [resetAllError, setResetAllError] = useState<string | null>(null);
  const [resetAllMessage, setResetAllMessage] = useState<string | null>(null);

  const [form, setForm] = useState(emptyForm);
  const [known, setKnown] = useState<{ orderCode: number | null; remaining: number } | null>(null);
  const lookupSeq = useRef(0);
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [missedOpenId, setMissedOpenId] = useState<string | null>(null);
  const [missedRegId, setMissedRegId] = useState("");
  const [missedDate, setMissedDate] = useState(localDateKey(new Date()));
  const [missedMeal, setMissedMeal] = useState<"LUNCH" | "DINNER">("LUNCH");
  const [missedBusy, setMissedBusy] = useState(false);
  const [missedError, setMissedError] = useState<string | null>(null);
  const [missedSuccess, setMissedSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState("");
  const [lowMealOnly, setLowMealOnly] = useState(false);
  const [priceFilter, setPriceFilter] = useState<"ALL" | number>("ALL");
  const [loadingList, setLoadingList] = useState(true);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);

  const [editingOrderCodeId, setEditingOrderCodeId] = useState<string | null>(null);
  const [orderCodeDraft, setOrderCodeDraft] = useState("");
  const [orderCodeError, setOrderCodeError] = useState<string | null>(null);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [majorDraft, setMajorDraft] = useState("");
  const [classDraft, setClassDraft] = useState("");
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

  // An existing phone number pulls the stored name/major/class so a returning student is re-registered, not re-typed.
  async function onPhoneChange(raw: string) {
    const phone = raw.replace(/[^0-9]/g, "");
    setForm((f) => ({ ...f, phone }));
    const seq = ++lookupSeq.current;
    if (phone.length < 9) {
      setKnown(null);
      return;
    }
    try {
      const res = await fetch(`/api/students/lookup?phone=${phone}`);
      const data = await res.json();
      if (seq !== lookupSeq.current) return;
      if (res.ok && data.found) {
        setKnown({ orderCode: data.orderCode, remaining: data.remaining });
        setForm((f) => ({
          ...f,
          name: data.name,
          major: data.major ?? "",
          className: data.className ?? "",
          startDate: renewStartDate(data.lastSessionDate),
          startMeal: defaultStartMeal(renewStartDate(data.lastSessionDate)),
        }));
      } else {
        setKnown(null);
      }
    } catch {
      if (seq === lookupSeq.current) setKnown(null);
    }
  }

  // Renewal shortcut for students running low: prefill the registration form from their last registration.
  function startRenew(s: StudentRow) {
    const last = s.latestRegistration;
    setForm({
      ...emptyForm,
      name: s.name,
      phone: s.phone,
      major: s.major ?? "",
      className: s.className ?? "",
      mealPattern: last?.mealPattern ?? emptyForm.mealPattern,
      pricePerMeal: last?.pricePerMeal ?? emptyForm.pricePerMeal,
      startDate: renewStartDate(s.lastSessionDate),
      startMeal: defaultStartMeal(renewStartDate(s.lastSessionDate)),
    });
    lookupSeq.current++;
    setKnown({ orderCode: s.orderCode, remaining: s.remaining });
    setFormError(null);
    setFormSuccess(null);
    document.getElementById("register-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
      setKnown(null);
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
    setMissedOpenId(null);
    setRemoveConfirmId(null);
    setRemoveError(null);
    const res = await fetch(`/api/students/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function removeSession(studentId: string, sessionId: string) {
    setRemovingId(sessionId);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/remove`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRemoveError(data.error ?? "Không thể xóa buổi ăn.");
        return;
      }
      setRemoveConfirmId(null);
      loadStudents(search);
      const res2 = await fetch(`/api/students/${studentId}`);
      if (res2.ok) setDetail(await res2.json());
    } finally {
      setRemovingId(null);
    }
  }

  async function submitMissedSession(studentId: string) {
    if (!missedRegId) return;
    setMissedBusy(true);
    setMissedError(null);
    setMissedSuccess(null);
    try {
      const res = await fetch(`/api/registrations/${missedRegId}/missed-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: missedDate, mealType: missedMeal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMissedError(data.error ?? "Không thể ghi nhận buổi ăn.");
        return;
      }
      setMissedSuccess("Đã ghi nhận. Tổng số buổi được giữ nguyên như gói đã mua.");
      loadStudents(search);
      const res2 = await fetch(`/api/students/${studentId}`);
      if (res2.ok) setDetail(await res2.json());
    } finally {
      setMissedBusy(false);
    }
  }

  async function deleteStudent() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/students/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "Không thể xóa sinh viên.");
        return;
      }
      if (expandedId === deleteTarget.id) setExpandedId(null);
      setDeleteTarget(null);
      loadStudents(search);
    } finally {
      setDeleting(false);
    }
  }

  async function savePhone(id: string) {
    setPhoneError(null);
    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneDraft.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPhoneError(data.error ?? "Không thể đổi số điện thoại.");
      return;
    }
    setEditingPhoneId(null);
    loadStudents(search);
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

  function startEditClass(s: StudentRow) {
    setEditingClassId(s.id);
    setMajorDraft(s.major ?? "");
    setClassDraft(s.className ?? "");
  }

  async function saveClass(id: string) {
    const res = await fetch(`/api/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ major: majorDraft || null, className: classDraft || null }),
    });
    if (res.ok) {
      setEditingClassId(null);
      loadStudents(search);
    }
  }

  async function resetAllStudents() {
    setResettingAll(true);
    setResetAllError(null);
    try {
      const res = await fetch("/api/students/reset-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESET" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetAllError(data.error ?? "Không thể reset.");
        return;
      }
      setShowResetAll(false);
      setResetAllMessage(
        `Đã reset: ${data.studentCount} sinh viên và ${data.sessionCount} buổi ăn được chuyển vào bản lưu trữ (Admin có thể khôi phục).`,
      );
      loadStudents(search);
    } finally {
      setResettingAll(false);
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

  // Distinct meal prices currently in use, for the price filter chips (e.g. 30.000đ / 40.000đ).
  const priceOptions = Array.from(
    new Set(students.map((s) => s.latestRegistration?.pricePerMeal).filter((p): p is number => p != null)),
  ).sort((a, b) => a - b);

  const visibleStudents = students.filter(
    (s) =>
      (!lowMealOnly || s.lowMeal) &&
      (priceFilter === "ALL" || s.latestRegistration?.pricePerMeal === priceFilter),
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Bán hàng" subtitle="Đăng ký suất ăn cho sinh viên và quản lý danh sách sinh viên." />

      <section>
        <div className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm animate-rise-in">
          <div className="flex items-center gap-3 bg-gradient-to-r from-red-600 to-red-500 px-5 py-4 text-white">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm bg-white/20">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 3v7a3 3 0 0 0 3 3v8M7 3v6M10 3v7a3 3 0 0 1-3 3M17 21V3c-2.5 1.5-4 4.5-4 8h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Đăng ký suất ăn cho sinh viên</h2>
              <p className="text-xs text-red-100">Sinh viên mới sẽ tự có tài khoản: tên đăng nhập là số điện thoại, mật khẩu mặc định 123.</p>
            </div>
          </div>

          <form id="register-form" onSubmit={onSubmit} className="scroll-mt-4 space-y-6 p-5">
            <fieldset>
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] text-white">1</span>
                Thông tin sinh viên
              </legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={labelCls}>Họ và tên</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls}
                    placeholder="Nguyễn Văn A"
                  />
                </div>
                <div>
                  <label className={labelCls}>Số điện thoại</label>
                  <input
                    required
                    inputMode="numeric"
                    value={form.phone}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    className={inputCls}
                    placeholder="09xxxxxxxx"
                  />
                  {known && (
                    <p className="mt-1 text-xs text-green-700">
                      Sinh viên đã có trong danh sách{known.orderCode != null ? ` (STT ${known.orderCode})` : ""}, còn {known.remaining} suất.
                      Đăng ký này sẽ gia hạn thêm.
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Ngành</label>
                  <select
                    value={form.major}
                    onChange={(e) => {
                      const major = e.target.value;
                      setForm({
                        ...form,
                        major,
                        className: classLevelsFor(major).includes(form.className) ? form.className : "",
                      });
                    }}
                    className={inputCls}
                  >
                    <option value="">Chọn ngành (tùy chọn)</option>
                    {MAJORS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Lớp</label>
                  <select
                    value={form.className}
                    onChange={(e) => setForm({ ...form, className: e.target.value })}
                    disabled={!form.major}
                    className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
                  >
                    <option value="">{form.major ? "Chọn lớp (tùy chọn)" : "Chọn ngành trước"}</option>
                    {classLevelsFor(form.major).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            <div className="border-t border-dashed border-slate-200" />

            <fieldset>
              <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] text-white">2</span>
                Gói suất ăn
              </legend>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={labelCls}>Ngày bắt đầu</label>
                  <input
                    required
                    type="date"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm({ ...form, startDate: e.target.value, startMeal: defaultStartMeal(e.target.value) })
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Số buổi ăn</label>
                  <input
                    required
                    type="number"
                    min={1}
                    max={200}
                    value={form.totalSessions}
                    onChange={(e) => setForm({ ...form, totalSessions: Number(e.target.value) })}
                    className={inputCls}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {SESSION_PRESETS.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setForm({ ...form, totalSessions: n })}
                        className={chipCls(form.totalSessions === n)}
                      >
                        {n} buổi
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Bữa ăn</label>
                  <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                    {MEAL_OPTIONS.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setForm({ ...form, mealPattern: value })}
                        className={`rounded-lg px-2 py-2 text-sm font-medium transition ${
                          form.mealPattern === value
                            ? "bg-red-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-white hover:text-red-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {form.mealPattern === "BOTH" && (
                    <div className="mt-2">
                      <p className="mb-1 text-xs text-slate-500">Bữa đầu tiên trong ngày bắt đầu</p>
                      <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                        {(
                          [
                            ["LUNCH", "Bắt đầu từ trưa"],
                            ["DINNER", "Bắt đầu từ tối"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setForm({ ...form, startMeal: value })}
                            className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                              form.startMeal === value
                                ? "bg-red-600 text-white shadow-sm"
                                : "text-slate-600 hover:bg-white hover:text-red-700"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Giá mỗi suất (VNĐ)</label>
                  <input
                    required
                    type="number"
                    min={0}
                    step={1000}
                    value={form.pricePerMeal}
                    onChange={(e) => setForm({ ...form, pricePerMeal: Number(e.target.value) })}
                    className={inputCls}
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PRICE_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setForm({ ...form, pricePerMeal: p })}
                        className={chipCls(form.pricePerMeal === p)}
                      >
                        {p.toLocaleString("vi-VN")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className={labelCls}>Ghi chú</label>
                <input
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  className={inputCls}
                  placeholder="Ví dụ: ăn chay, dị ứng hải sản... (tùy chọn)"
                />
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50/70 px-4 py-3">
              <div className="text-sm text-slate-600">
                <span className="font-semibold text-slate-800">{form.totalSessions || 0} buổi</span> &middot;{" "}
                {PATTERN_LABEL[form.mealPattern]} &middot; tổng{" "}
                <span className="font-bold text-red-700">
                  {currency.format((form.totalSessions || 0) * (form.pricePerMeal || 0))}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {formError && <p className="text-sm text-red-600 animate-pop-in">{formError}</p>}
                {formSuccess && <p className="text-sm text-green-600 animate-pop-in">{formSuccess}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                >
                  {submitting ? "Đang lưu..." : "Đăng ký suất ăn"}
                </button>
              </div>
            </div>
          </form>
        </div>
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
            {canResetAll && (
              <button
                onClick={() => {
                  setResetAllError(null);
                  setResetAllMessage(null);
                  setShowResetAll(true);
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                title="Chuyển toàn bộ sinh viên vào bản lưu trữ để bắt đầu lại (Admin có thể khôi phục)"
              >
                Reset toàn bộ sinh viên
              </button>
            )}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc số điện thoại..."
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-full sm:w-64 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button
            onClick={() => setLowMealOnly((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              lowMealOnly
                ? "border-red-600 bg-red-600 text-white shadow-sm"
                : "border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            }`}
            title={`Chỉ hiện sinh viên còn từ ${LOW_MEAL_THRESHOLD} buổi trở xuống`}
          >
            ⚠ Cần gia hạn
          </button>
          {priceOptions.length > 1 && (
            <>
              <span className="text-xs text-slate-300">|</span>
              <button
                onClick={() => setPriceFilter("ALL")}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                  priceFilter === "ALL"
                    ? "border-red-600 bg-red-600 text-white shadow-sm"
                    : "border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                }`}
              >
                Mọi giá
              </button>
              {priceOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriceFilter(p)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    priceFilter === p
                      ? "border-red-600 bg-red-600 text-white shadow-sm"
                      : "border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  }`}
                >
                  {currency.format(p)}
                </button>
              ))}
            </>
          )}
          {(lowMealOnly || priceFilter !== "ALL") && (
            <span className="text-xs text-slate-400">{visibleStudents.length} kết quả</span>
          )}
        </div>
        {backfillMessage && <p className="text-xs text-slate-500 mb-2">{backfillMessage}</p>}
        {resetAllMessage && (
          <p className="text-sm rounded-lg bg-green-50 text-green-700 px-3 py-2 mb-2 animate-pop-in">{resetAllMessage}</p>
        )}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
          {loadingList && <p className="p-4 text-sm text-slate-400">Đang tải...</p>}
          {!loadingList && students.length === 0 && (
            <p className="p-4 text-sm text-slate-400">Chưa có sinh viên nào.</p>
          )}
          {!loadingList && students.length > 0 && visibleStudents.length === 0 && (
            <p className="p-4 text-sm text-slate-400">Không có sinh viên nào khớp bộ lọc.</p>
          )}
          {visibleStudents.map((s, i) => (
            <div key={s.id} className="animate-rise-in" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
              <div className="p-3 flex flex-col items-start gap-1.5 xl:items-center xl:grid xl:grid-cols-[3.5rem_minmax(0,12rem)_minmax(0,11rem)_minmax(11rem,1fr)_5.5rem_6.5rem_13rem] xl:gap-3 hover:bg-red-50/40 transition-colors">
                {editingOrderCodeId === s.id ? (
                  <div className="xl:w-full flex-shrink-0">
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
                    className={`xl:w-full flex-shrink-0 text-left text-sm font-mono font-semibold rounded-lg px-2 py-1 hover:bg-red-50 ${
                      s.orderCode != null ? "text-red-700" : "text-slate-300"
                    }`}
                  >
                    {s.orderCode ?? "—"}
                  </button>
                )}
                <div className="xl:w-full min-w-0">
                  <p className={`text-sm font-medium ${s.lowMeal ? "text-red-600" : "text-slate-800"}`}>
                    {s.name}
                    {s.lowMeal && " ⚠"}
                  </p>
                  {editingPhoneId === s.id ? (
                    <div className="mt-0.5">
                      <div className="flex items-center gap-1">
                        <input
                          autoFocus
                          inputMode="numeric"
                          value={phoneDraft}
                          onChange={(e) => setPhoneDraft(e.target.value.replace(/[^0-9]/g, ""))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") savePhone(s.id);
                            if (e.key === "Escape") setEditingPhoneId(null);
                          }}
                          className="w-32 rounded-lg border border-red-300 px-2 py-0.5 text-xs outline-none focus:ring-2 focus:ring-red-100"
                        />
                        <button onClick={() => savePhone(s.id)} className="text-green-600 hover:text-green-700 text-sm" title="Lưu">
                          ✓
                        </button>
                        <button onClick={() => setEditingPhoneId(null)} className="text-slate-400 hover:text-slate-600 text-sm" title="Hủy">
                          ✕
                        </button>
                      </div>
                      {phoneError && <p className="text-xs text-red-600">{phoneError}</p>}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingPhoneId(s.id);
                        setPhoneDraft(s.phone);
                        setPhoneError(null);
                      }}
                      title="Bấm để đổi số điện thoại (cũng là tên đăng nhập)"
                      className="text-xs text-slate-400 hover:text-red-600 hover:underline"
                    >
                      {s.phone}
                    </button>
                  )}
                </div>
                {editingClassId === s.id ? (
                  <div className="flex flex-wrap items-center gap-1 xl:w-full flex-shrink-0">
                    <select
                      autoFocus
                      value={majorDraft}
                      onChange={(e) => {
                        setMajorDraft(e.target.value);
                        if (!classLevelsFor(e.target.value).includes(classDraft)) setClassDraft("");
                      }}
                      className="rounded-lg border border-red-300 px-1.5 py-1 text-sm outline-none focus:ring-2 focus:ring-red-100"
                    >
                      <option value="">— Ngành —</option>
                      {MAJORS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <select
                      value={classDraft}
                      onChange={(e) => setClassDraft(e.target.value)}
                      disabled={!majorDraft}
                      className="rounded-lg border border-red-300 px-1.5 py-1 text-sm outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-50"
                    >
                      <option value="">— Lớp —</option>
                      {classLevelsFor(majorDraft).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => saveClass(s.id)} className="text-green-600 hover:text-green-700 text-sm" title="Lưu">
                      ✓
                    </button>
                    <button
                      onClick={() => setEditingClassId(null)}
                      className="text-slate-400 hover:text-slate-600 text-sm"
                      title="Hủy"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEditClass(s)}
                    title="Bấm để sửa ngành và lớp"
                    className={`xl:w-full flex-shrink-0 text-left text-sm rounded-lg px-2 py-1 hover:bg-red-50 ${
                      s.major || s.className ? "text-slate-700" : "text-slate-300"
                    }`}
                  >
                    {s.major || s.className ? (
                      <>
                        <span className="font-medium">{s.className || "—"}</span>
                        <span className="text-xs text-slate-500"> · {s.major || "chưa có ngành"}</span>
                      </>
                    ) : (
                      "— ngành / lớp —"
                    )}
                  </button>
                )}
                <div className="text-sm text-slate-600 xl:min-w-0">
                  {s.latestRegistration ? (
                    <span className="flex flex-col leading-snug">
                      <span className="whitespace-nowrap">
                        {PATTERN_LABEL[s.latestRegistration.mealPattern]} &middot; {s.latestRegistration.totalSessions} buổi
                      </span>
                      <span className="whitespace-nowrap">
                        {currency.format(s.latestRegistration.pricePerMeal)} &middot; từ {fmtDate(s.latestRegistration.startDate)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-400">Chưa có đăng ký</span>
                  )}
                </div>
                <div className={`text-sm font-medium whitespace-nowrap xl:text-right ${s.lowMeal ? "text-red-600" : "text-slate-700"}`}>
                  Còn {s.remaining} buổi
                </div>
                <div className="xl:text-center">
                  {s.mustChangePassword && (
                    <span className="whitespace-nowrap text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Chưa đổi MK</span>
                  )}
                </div>
                <div className="flex items-center gap-2 xl:justify-end">
                {s.lowMeal && (
                  <button
                    onClick={() => startRenew(s)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-600 font-semibold text-white shadow-sm hover:bg-red-700"
                  >
                    Gia hạn
                  </button>
                )}
                <button
                  onClick={() => toggleExpand(s.id)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  {expandedId === s.id ? "Đóng" : "Chi tiết"}
                </button>
                {canResetAll && (
                  <button
                    onClick={() => {
                      setDeleteTarget(s);
                      setDeleteError(null);
                    }}
                    title="Xóa sinh viên khỏi danh sách"
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    Xóa
                  </button>
                )}
                </div>
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
                              className={`flex flex-wrap items-center gap-2 ${
                                sx.status === "CANCELLED"
                                  ? "text-slate-400 line-through"
                                  : sx.pickedUp
                                    ? "text-green-600"
                                    : sx.status === "COMPLETED"
                                      ? "text-amber-600"
                                      : "text-slate-600"
                              }`}
                            >
                              <span>
                                {fmtDate(sx.date)} &middot; {sx.mealType === "LUNCH" ? "Trưa" : "Tối"}
                                {sx.status === "CANCELLED"
                                  ? " (đã hủy)"
                                  : sx.pickedUp
                                    ? " (đã ăn)"
                                    : sx.status === "COMPLETED"
                                      ? " (chưa lấy)"
                                      : ""}
                                {sx.note ? ` — ${sx.note}` : ""}
                              </span>
                              {canResetAll && sx.status === "SCHEDULED" && !sx.pickedUp && (
                                removeConfirmId === sx.id ? (
                                  <span className="flex items-center gap-1 no-underline">
                                    <button
                                      onClick={() => removeSession(s.id, sx.id)}
                                      disabled={removingId === sx.id}
                                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                                    >
                                      Xác nhận xóa
                                    </button>
                                    <button
                                      onClick={() => setRemoveConfirmId(null)}
                                      className="text-xs text-slate-400 hover:underline"
                                    >
                                      Thôi
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setRemoveConfirmId(sx.id)}
                                    className="text-xs text-slate-300 no-underline hover:text-red-600 hover:underline"
                                    title="Xóa buổi này (không bù, dùng khi buổi bị đăng ký dư)"
                                  >
                                    Xóa
                                  </button>
                                )
                              )}
                            </li>
                          ))}
                      </ul>
                      {removeError && <p className="text-xs text-red-600">{removeError}</p>}

                      <div className="mt-3 border-t border-red-100 pt-3">
                        {missedOpenId === s.id ? (
                          <div className="space-y-2 rounded-lg bg-white p-3 animate-pop-in">
                            <p className="text-xs text-slate-500">
                              Dùng khi nhân viên quên đăng ký 1 buổi mà sinh viên đã ăn rồi (ví dụ chọn nhầm &quot;Bắt
                              đầu từ tối&quot; dù bạn ấy đã ăn trưa). Hệ thống ghi nhận buổi này là đã ăn, và tự bớt 1
                              buổi ở cuối lịch để tổng số buổi không đổi so với gói đã mua.
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                              {detail.registrations.length > 1 && (
                                <select
                                  value={missedRegId}
                                  onChange={(e) => setMissedRegId(e.target.value)}
                                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                >
                                  {detail.registrations.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      Đợt từ {fmtDate(r.startDate)} ({r.totalSessions} buổi)
                                    </option>
                                  ))}
                                </select>
                              )}
                              <input
                                type="date"
                                value={missedDate}
                                max={localDateKey(new Date())}
                                onChange={(e) => setMissedDate(e.target.value)}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                              />
                              <select
                                value={missedMeal}
                                onChange={(e) => setMissedMeal(e.target.value as "LUNCH" | "DINNER")}
                                className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                              >
                                <option value="LUNCH">Bữa trưa</option>
                                <option value="DINNER">Bữa tối</option>
                              </select>
                              <button
                                onClick={() => submitMissedSession(s.id)}
                                disabled={missedBusy}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                              >
                                {missedBusy ? "Đang lưu..." : "Ghi nhận đã ăn"}
                              </button>
                              <button
                                onClick={() => setMissedOpenId(null)}
                                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                              >
                                Thôi
                              </button>
                            </div>
                            {missedError && <p className="text-xs text-red-600">{missedError}</p>}
                            {missedSuccess && <p className="text-xs text-green-600">{missedSuccess}</p>}
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setMissedOpenId(s.id);
                              setMissedRegId(detail.registrations[0]?.id ?? "");
                              setMissedDate(localDateKey(new Date()));
                              setMissedMeal("LUNCH");
                              setMissedError(null);
                              setMissedSuccess(null);
                            }}
                            disabled={detail.registrations.length === 0}
                            className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                          >
                            + Ghi nhận buổi ăn bị bỏ sót
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {deleteTarget && (
        <ConfirmModal
          title={`Xóa sinh viên ${deleteTarget.name}?`}
          confirmWord="XOA"
          confirmLabel="Xóa sinh viên"
          busy={deleting}
          error={deleteError}
          onConfirm={deleteStudent}
          onClose={() => setDeleteTarget(null)}
        >
          <p>
            Tài khoản <b>{deleteTarget.phone}</b>, toàn bộ đăng ký và lịch ăn của bạn này sẽ bị <b>xóa vĩnh viễn</b> và
            không khôi phục được. Số liệu báo cáo cũ của bạn này cũng mất.
          </p>
          <p>Nếu chỉ cần ngừng cho bạn này đăng nhập, hãy khóa tài khoản ở mục Tài khoản thay vì xóa.</p>
        </ConfirmModal>
      )}

      {showResetAll && (
        <ConfirmModal
          title="Reset toàn bộ sinh viên?"
          confirmWord="RESET"
          confirmLabel="Reset toàn bộ"
          busy={resettingAll}
          error={resetAllError}
          onConfirm={resetAllStudents}
          onClose={() => setShowResetAll(false)}
        >
          <p>
            Toàn bộ <b>tài khoản sinh viên, đăng ký và lịch ăn</b> sẽ bị gỡ khỏi hệ thống. Sinh viên sẽ không đăng nhập
            được nữa.
          </p>
          <p>
            Dữ liệu được <b>lưu vào bản lưu trữ</b>, Admin có thể khôi phục lại ở mục &quot;Lưu trữ&quot;. Tài khoản nhân
            sự và nhật ký không bị ảnh hưởng.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
