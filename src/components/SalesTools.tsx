"use client";

import PageHeader from "@/components/PageHeader";
import { useEffect, useRef, useState } from "react";
import { localDateKey, LOW_MEAL_THRESHOLD } from "@/lib/client-session-rules";
import { classLevelsFor, MAJORS } from "@/lib/student-info";
import { foldText } from "@/lib/text";
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
  /** Meals owed (positive) or in excess (negative) compared with what was bought. */
  missing: number;
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
    balance: {
      total: number;
      completed: number;
      scheduled: number;
      cancelled: number;
      removed: number;
      missing: number;
    } | null;
  }[];
  sessions: {
    id: string;
    date: string;
    mealType: "LUNCH" | "DINNER";
    status: string;
    pickedUp: boolean;
    note: string | null;
    hasCompensation: boolean;
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
  const [restoreConfirmId, setRestoreConfirmId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
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
  // Scan of all students for double bookings (two live meals at the same day and meal).
  type DuplicateScan = {
    checked: number;
    students: {
      studentId: string;
      name: string;
      phone: string;
      orderCode: number | null;
      slots: {
        date: string;
        mealType: "LUNCH" | "DINNER";
        sessions: { id: string; status: string; pickedUp: boolean; registrationStart: string }[];
      }[];
    }[];
  };
  const [scan, setScan] = useState<DuplicateScan | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [fixingScanId, setFixingScanId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [confirmMergeAll, setConfirmMergeAll] = useState(false);
  const [lowMealOnly, setLowMealOnly] = useState(false);
  const [mismatchOnly, setMismatchOnly] = useState(false);
  // Admin: editing a meal package (number of meals, price, note).
  const [editPkgId, setEditPkgId] = useState<string | null>(null);
  const [pkgTotal, setPkgTotal] = useState("");
  const [pkgPrice, setPkgPrice] = useState("");
  const [pkgNote, setPkgNote] = useState("");
  const [pkgPriceEaten, setPkgPriceEaten] = useState(false);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgError, setPkgError] = useState<string | null>(null);
  // Two meals on the same day and meal: moving the extra one to a free day.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // Giving back meals a student is short of (or taking off a surplus), one registration at a time with a confirmation.
  const [rebalanceConfirmId, setRebalanceConfirmId] = useState<string | null>(null);
  const [rebalancingId, setRebalancingId] = useState<string | null>(null);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);
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

  // Search is filtered entirely client-side (see `visibleStudents`) so it can ignore case and
  // diacritics ("khue" still finds "Khuê") — a server `contains` query couldn't do that without
  // extra DB setup, so the full list is simply kept in memory and re-fetched on changes.
  // `silent` is the automatic check when the page opens: it only shows something when it finds a double booking.
  async function runScan(silent = false) {
    setScanBusy(true);
    setScanError(null);
    setConfirmMergeAll(false);
    try {
      const res = await fetch("/api/students/duplicates");
      const data = await res.json();
      if (!res.ok) {
        if (!silent) setScanError(data.error ?? "Không quét được.");
        return;
      }
      setScan(silent && data.students.length === 0 ? null : data);
    } catch {
      if (!silent) setScanError("Không quét được.");
    } finally {
      setScanBusy(false);
    }
  }

  // Merges the double bookings into one meal each, for one student or for everyone (see the server action).
  async function mergeDuplicates(studentId?: string) {
    setFixingScanId(studentId ?? "ALL");
    setScanError(null);
    try {
      const res = await fetch("/api/students/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studentId ? { studentId } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error ?? "Không gộp được.");
        return;
      }
      setScanMessage(
        data.merged > 0
          ? `Đã gộp: bỏ ${data.merged} suất trùng của ${data.students} sinh viên${data.skipped ? `; ${data.skipped} suất đã lấy cơm nên giữ nguyên` : ""}.`
          : "Không có suất nào cần gộp.",
      );
      await runScan();
      loadStudents();
    } finally {
      setFixingScanId(null);
    }
  }

  async function loadStudents() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/students");
      const data = await res.json();
      if (res.ok) setStudents(data.students);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    runScan(true);
  }, []);

  // Meals auto-complete at fixed clock times (14:00 lunch, 20:00 dinner) with nobody clicking
  // anything, so re-poll periodically — otherwise "Còn X buổi" only updates on the next explicit action.
  useEffect(() => {
    const t = setInterval(() => loadStudents(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

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
      loadStudents();
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
    setRestoreConfirmId(null);
    setRestoreError(null);
    setRebalanceConfirmId(null);
    setRebalanceError(null);
    setEditPkgId(null);
    const res = await fetch(`/api/students/${id}`);
    if (!res.ok) return;
    const data: StudentDetail = await res.json();
    setDetail(data);
    // The list row's "Còn X buổi" was fetched at page-load time and doesn't update on its own as
    // time passes (e.g. a meal auto-completing at its 14:00/20:00 cutoff) — sync it from this
    // fresher detail fetch so it doesn't show a stale count next to the accurate one below.
    const remaining = data.sessions.filter((s) => s.status === "SCHEDULED").length;
    setStudents((prev) =>
      prev.map((s) => (s.id === id ? { ...s, remaining, lowMeal: remaining <= LOW_MEAL_THRESHOLD } : s)),
    );
  }

  function startEditPackage(r: StudentDetail["registrations"][number]) {
    setEditPkgId(r.id);
    setPkgTotal(String(r.totalSessions));
    setPkgPrice(String(r.pricePerMeal));
    setPkgNote(r.note ?? "");
    setPkgPriceEaten(false);
    setPkgError(null);
  }

  async function savePackage(studentId: string, r: StudentDetail["registrations"][number]) {
    const total = Number(pkgTotal);
    const price = Number(pkgPrice);
    if (!Number.isInteger(total) || total < 1) return setPkgError("Số buổi phải là số nguyên từ 1 trở lên.");
    if (!Number.isInteger(price) || price < 0) return setPkgError("Giá mỗi suất không hợp lệ.");
    setPkgBusy(true);
    setPkgError(null);
    try {
      const res = await fetch(`/api/registrations/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalSessions: total,
          pricePerMeal: price,
          note: pkgNote.trim() === "" ? null : pkgNote.trim(),
          priceForEaten: pkgPriceEaten,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPkgError(data.error ?? "Không thể sửa gói ăn.");
        return;
      }
      setEditPkgId(null);
      loadStudents();
      const res2 = await fetch(`/api/students/${studentId}`);
      if (res2.ok) {
        const d: StudentDetail = await res2.json();
        setDetail(d);
        const remaining = d.sessions.filter((x) => x.status === "SCHEDULED").length;
        setStudents((prev) =>
          prev.map((x) => (x.id === studentId ? { ...x, remaining, lowMeal: remaining <= LOW_MEAL_THRESHOLD } : x)),
        );
      }
    } finally {
      setPkgBusy(false);
    }
  }

  async function moveDuplicate(studentId: string, sessionId: string) {
    setMovingId(sessionId);
    setMoveError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/move-duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMoveError(data.error ?? "Không thể dời buổi ăn.");
        return;
      }
      loadStudents();
      const res2 = await fetch(`/api/students/${studentId}`);
      if (res2.ok) setDetail(await res2.json());
    } finally {
      setMovingId(null);
    }
  }

  async function rebalanceRegistration(studentId: string, registrationId: string) {
    setRebalancingId(registrationId);
    setRebalanceError(null);
    try {
      const res = await fetch(`/api/registrations/${registrationId}/rebalance`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRebalanceError(data.error ?? "Không thể bù buổi.");
        return;
      }
      setRebalanceConfirmId(null);
      loadStudents();
      const res2 = await fetch(`/api/students/${studentId}`);
      if (res2.ok) setDetail(await res2.json());
    } finally {
      setRebalancingId(null);
    }
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
      loadStudents();
      const res2 = await fetch(`/api/students/${studentId}`);
      if (res2.ok) setDetail(await res2.json());
    } finally {
      setRemovingId(null);
    }
  }

  // Restore a cancelled meal on the student's behalf, bypassing the usual cutoff — for when a
  // student cancelled by mistake or missed the self-service window and asks staff to fix it.
  async function staffRestoreSession(studentId: string, sessionId: string) {
    setRestoringId(sessionId);
    setRestoreError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRestoreError(data.error ?? "Không thể khôi phục buổi ăn.");
        return;
      }
      setRestoreConfirmId(null);
      loadStudents();
      const res2 = await fetch(`/api/students/${studentId}`);
      if (res2.ok) setDetail(await res2.json());
    } finally {
      setRestoringId(null);
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
      loadStudents();
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
      loadStudents();
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
    loadStudents();
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
    loadStudents();
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
      loadStudents();
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
      loadStudents();
    } finally {
      setResettingAll(false);
    }
  }

  async function resetOrderCodes() {
    setResetting(true);
    try {
      await fetch("/api/students/reset-order-codes", { method: "POST" });
      setConfirmingReset(false);
      loadStudents();
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
      loadStudents();
    } finally {
      setBackfilling(false);
    }
  }

  // Distinct meal prices currently in use, for the price filter chips (e.g. 30.000đ / 40.000đ).
  const priceOptions = Array.from(
    new Set(students.map((s) => s.latestRegistration?.pricePerMeal).filter((p): p is number => p != null)),
  ).sort((a, b) => a - b);

  const q = foldText(search);
  const visibleStudents = students.filter(
    (s) =>
      (!lowMealOnly || s.lowMeal) &&
      (!mismatchOnly || s.missing !== 0) &&
      (priceFilter === "ALL" || s.latestRegistration?.pricePerMeal === priceFilter) &&
      (!q || foldText(s.name).includes(q) || s.phone.includes(search.trim())),
  );

  // Slots (day + meal) of the open student that hold more than one live meal: a double booking to fix.
  const slotId = (x: { date: string; mealType: string }) => `${new Date(x.date).toDateString()}|${x.mealType}`;
  const dupSlots = new Set<string>();
  if (detail) {
    const seen = new Map<string, number>();
    for (const x of detail.sessions) {
      if (x.status === "CANCELLED") continue;
      seen.set(slotId(x), (seen.get(slotId(x)) ?? 0) + 1);
    }
    for (const [k, n] of seen) if (n > 1) dupSlots.add(k);
  }

  const stats = { upcoming: 0, eaten: 0, unpicked: 0, cancelled: 0 };
  for (const x of detail?.sessions ?? []) {
    if (x.status === "CANCELLED") stats.cancelled += 1;
    else if (x.pickedUp) stats.eaten += 1;
    else if (x.status === "COMPLETED") stats.unpicked += 1;
    else stats.upcoming += 1;
  }

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
          {canResetAll && (
          <button
            onClick={() => setMismatchOnly((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              mismatchOnly
                ? "border-red-600 bg-red-600 text-white shadow-sm"
                : "border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            }`}
            title="Chỉ hiện sinh viên có số buổi ăn không khớp với gói đã mua (thiếu hoặc dư)"
          >
            Lệch buổi ({students.filter((x) => x.missing !== 0).length})
          </button>
          )}
          {canResetAll && (
            <button
              onClick={() => {
                setScanMessage(null);
                runScan();
              }}
              disabled={scanBusy}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              title="Quét tất cả sinh viên xem còn bạn nào có hai suất cùng ngày và cùng bữa"
            >
              {scanBusy ? "Đang quét..." : "Quét trùng buổi"}
            </button>
          )}
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
          {(lowMealOnly || mismatchOnly || priceFilter !== "ALL") && (
            <span className="text-xs text-slate-400">{visibleStudents.length} kết quả</span>
          )}
        </div>
        {backfillMessage && <p className="text-xs text-slate-500 mb-2">{backfillMessage}</p>}
        {scanError && <p className="text-sm rounded-lg bg-red-50 text-red-700 px-3 py-2 mb-2">{scanError}</p>}
        {scan && (
          <div
            className={`mb-2 rounded-xl border p-3 text-sm animate-pop-in ${
              scan.students.length > 0 ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-slate-700">
                {scan.students.length === 0
                  ? `Đã quét ${scan.checked} sinh viên: không có bạn nào bị trùng buổi.`
                  : `⚠ Có ${scan.students.length} sinh viên bị trùng buổi (hai suất cùng ngày, cùng bữa):`}
              </p>
              <button onClick={() => setScan(null)} className="text-xs text-slate-400 hover:text-slate-600">
                Đóng
              </button>
            </div>
            {scanMessage && <p className="mt-1 text-xs text-green-700">{scanMessage}</p>}
            {scan.students.length > 0 && !canResetAll && (
              <p className="mt-1 text-xs text-slate-600">Hãy báo Quản lý hoặc Admin để gộp các suất trùng này.</p>
            )}
            {scan.students.length > 0 &&
              canResetAll &&
              (confirmMergeAll ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-xs animate-pop-in">
                  <span className="text-slate-700">
                    Gộp mỗi ngày và bữa trùng thành 1 suất cho cả {scan.students.length} sinh viên? Suất thừa bị bỏ (không bù).
                  </span>
                  <button
                    onClick={() => mergeDuplicates()}
                    disabled={fixingScanId !== null}
                    className="rounded-lg bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {fixingScanId === "ALL" ? "Đang gộp..." : "Xác nhận gộp tất cả"}
                  </button>
                  <button onClick={() => setConfirmMergeAll(false)} className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50">
                    Thôi
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmMergeAll(true)}
                  className="mt-2 rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Gộp tất cả buổi trùng
                </button>
              ))}
            {scan.students.length > 0 && (
              <ul className="mt-2 divide-y divide-slate-100">
                {scan.students.map((st) => (
                  <li key={st.studentId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                    <span className="w-14 font-mono text-base font-extrabold text-red-700">{st.orderCode ?? "—"}</span>
                    <span className="font-medium text-slate-800">{st.name}</span>
                    <span className="text-xs text-slate-400">{st.phone}</span>
                    <span className="text-xs text-red-600">
                      {st.slots
                        .map((sl) => `${fmtDate(sl.date)} ${sl.mealType === "LUNCH" ? "trưa" : "tối"} (${sl.sessions.length} suất)`)
                        .join(" · ")}
                    </span>
                    <span className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSearch(st.phone);
                          toggleExpand(st.studentId);
                        }}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Xem
                      </button>
                      {canResetAll && (
                      <button
                        onClick={() => mergeDuplicates(st.studentId)}
                        disabled={fixingScanId !== null}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {fixingScanId === st.studentId ? "Đang gộp..." : "Gộp buổi trùng"}
                      </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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
                  {canResetAll && s.missing !== 0 && (
                    <span
                      className={`block text-xs font-semibold ${s.missing > 0 ? "text-red-600" : "text-amber-600"}`}
                      title="So với số buổi đã mua trừ buổi đã ăn và buổi đã xóa. Mở Chi tiết để xem và bù."
                    >
                      {s.missing > 0 ? `Thiếu ${s.missing} buổi` : `Dư ${-s.missing} buổi`}
                    </span>
                  )}
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
                    <div className="space-y-4">
                      {/* ---- 1. Where the student stands */}
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <StatTile label="Còn lại" value={stats.upcoming} hint="buổi sắp tới" tone="red" />
                        <StatTile label="Đã ăn" value={stats.eaten} hint="đã lấy cơm" tone="green" />
                        <StatTile label="Chưa lấy" value={stats.unpicked} hint="đã qua, không lấy" tone="amber" />
                        <StatTile label="Đã hủy" value={stats.cancelled} hint="hủy hoặc xóa" tone="slate" />
                      </div>

                      {dupSlots.size > 0 && (
                        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                          ⚠ Bạn này có {dupSlots.size} buổi bị trùng (hai suất cùng ngày, cùng bữa). Tìm dòng &quot;Trùng buổi&quot;
                          trong lịch bên dưới, bấm <b>Sửa</b> để dời sang ngày trống hoặc xóa bớt.
                        </p>
                      )}

                      {/* ---- 2. One card per package */}
                      <div className="space-y-2">
                        <p className="font-semibold text-slate-700">Gói ăn đã đăng ký</p>
                        {detail.registrations.map((r) => {
                          const b = r.balance;
                          const base = b ? Math.max(b.total, b.completed + b.scheduled, 1) : 1;
                          return (
                            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold text-slate-800">
                                    Gói {r.totalSessions} buổi · {PATTERN_LABEL[r.mealPattern]}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {currency.format(r.pricePerMeal)}/suất · bắt đầu {fmtDate(r.startDate)}
                                    {r.note ? ` · ${r.note}` : ""}
                                  </p>
                                </div>
                                {canResetAll && editPkgId !== r.id && (
                                  <button
                                    onClick={() => startEditPackage(r)}
                                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                  >
                                    ✎ Sửa gói
                                  </button>
                                )}
                              </div>

                              {b && (
                                <div className="mt-2">
                                  <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
                                    <div className="bg-green-500" style={{ width: `${(b.completed / base) * 100}%` }} />
                                    <div className="bg-red-500" style={{ width: `${(b.scheduled / base) * 100}%` }} />
                                  </div>
                                  <p className="mt-1 text-xs text-slate-500">
                                    Đã dùng {b.completed} (gồm cả buổi chưa lấy) · sắp tới {b.scheduled} · đã hủy {b.cancelled - b.removed}
                                    {b.removed > 0 ? ` · đã xóa ${b.removed}` : ""}
                                  </p>
                                  {b.missing === 0 && <p className="mt-1 text-xs text-green-600">✓ Số buổi khớp với gói đã mua.</p>}
                                  {b.missing !== 0 && (
                                    <div
                                      className={`mt-1 rounded-lg px-3 py-2 text-xs ${
                                        b.missing > 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                                      }`}
                                    >
                                      {b.missing > 0
                                        ? `Thiếu ${b.missing} buổi so với gói đã mua (có buổi đã hủy mà chưa được bù).`
                                        : `Dư ${-b.missing} buổi so với gói đã mua.`}
                                      {rebalanceConfirmId === r.id ? (
                                        <span className="mt-1 flex flex-wrap items-center gap-2 animate-pop-in">
                                          <span>
                                            {b.missing > 0
                                              ? `Bù thêm ${b.missing} buổi vào chỗ trống sau buổi cuối?`
                                              : `Bớt ${-b.missing} buổi chưa ăn ở cuối lịch?`}
                                          </span>
                                          <button
                                            onClick={() => rebalanceRegistration(s.id, r.id)}
                                            disabled={rebalancingId === r.id}
                                            className="rounded-lg bg-red-600 px-3 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                          >
                                            {rebalancingId === r.id ? "Đang xử lý..." : "Xác nhận"}
                                          </button>
                                          <button
                                            onClick={() => setRebalanceConfirmId(null)}
                                            className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50"
                                          >
                                            Thôi
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            setRebalanceConfirmId(r.id);
                                            setRebalanceError(null);
                                          }}
                                          className="ml-2 font-semibold underline"
                                        >
                                          {b.missing > 0 ? `Bù ${b.missing} buổi` : `Bớt ${-b.missing} buổi`}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {canResetAll && editPkgId === r.id && (
                                <div className="mt-3 rounded-lg bg-red-50/60 p-3 animate-pop-in">
                                  <div className="flex flex-wrap items-end gap-3">
                                    <label className="text-xs font-medium text-slate-600">
                                      Số buổi
                                      <input
                                        type="number"
                                        min={1}
                                        max={200}
                                        value={pkgTotal}
                                        onChange={(e) => setPkgTotal(e.target.value)}
                                        className="mt-1 block w-20 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                      />
                                    </label>
                                    <label className="text-xs font-medium text-slate-600">
                                      Giá mỗi suất (đ)
                                      <input
                                        type="number"
                                        min={0}
                                        step={1000}
                                        value={pkgPrice}
                                        onChange={(e) => setPkgPrice(e.target.value)}
                                        className="mt-1 block w-28 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                      />
                                    </label>
                                    <label className="min-w-40 flex-1 text-xs font-medium text-slate-600">
                                      Ghi chú
                                      <input
                                        value={pkgNote}
                                        onChange={(e) => setPkgNote(e.target.value)}
                                        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                                      />
                                    </label>
                                    <button
                                      onClick={() => savePackage(s.id, r)}
                                      disabled={pkgBusy}
                                      className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                      {pkgBusy ? "Đang lưu..." : "Lưu"}
                                    </button>
                                    <button
                                      onClick={() => setEditPkgId(null)}
                                      className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs hover:bg-slate-50"
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                  <p className="mt-2 text-xs text-slate-500">
                                    {Number(pkgTotal) > r.totalSessions
                                      ? `Thêm ${Number(pkgTotal) - r.totalSessions} buổi vào chỗ trống sau buổi cuối. `
                                      : Number(pkgTotal) < r.totalSessions && Number(pkgTotal) >= 1
                                        ? `Bỏ ${r.totalSessions - Number(pkgTotal)} buổi cuối chưa ăn (khôi phục lại được). `
                                        : ""}
                                    {Number(pkgPrice) !== r.pricePerMeal ? "Giá mới áp dụng cho các buổi sắp tới. " : ""}
                                    {Number(pkgPrice) !== r.pricePerMeal && (
                                      <label className="inline-flex items-center gap-1 text-slate-600">
                                        <input
                                          type="checkbox"
                                          checked={pkgPriceEaten}
                                          onChange={(e) => setPkgPriceEaten(e.target.checked)}
                                          className="accent-red-600"
                                        />
                                        áp dụng cả cho buổi đã ăn
                                      </label>
                                    )}
                                  </p>
                                  {pkgError && <p className="mt-1 text-xs text-red-600">{pkgError}</p>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {rebalanceError && <p className="text-xs text-red-600">{rebalanceError}</p>}
                      </div>

                      {/* ---- 3. Every meal, with what can be done to it */}
                      <div>
                        <p className="font-semibold text-slate-700">Lịch buổi ăn</p>
                        <p className="mb-1 text-xs text-slate-500">
                          <b>Xóa</b>: bỏ hẳn buổi, không bù · <b>Khôi phục</b>: trả buổi đã hủy về lịch · <b>Dời</b>: chuyển buổi trùng sang
                          ngày trống.
                        </p>
                        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                          {[...detail.sessions]
                            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                            .map((sx) => {
                              const cancelled = sx.status === "CANCELLED";
                              const removed = !!sx.note && (sx.note.startsWith("Xóa thủ công") || sx.note.startsWith("Giảm gói"));
                              const dup = !cancelled && dupSlots.has(slotId(sx));
                              const badge = cancelled
                                ? { text: removed ? "Đã xóa" : "Đã hủy", cls: "bg-slate-100 text-slate-500" }
                                : sx.pickedUp
                                  ? { text: "Đã ăn", cls: "bg-green-50 text-green-700" }
                                  : sx.status === "COMPLETED"
                                    ? { text: "Chưa lấy", cls: "bg-amber-50 text-amber-700" }
                                    : { text: "Sắp tới", cls: "bg-red-50 text-red-700" };
                              const canRemove = canResetAll && !cancelled;
                              const canRestore = cancelled && sx.hasCompensation;
                              const canMove = dup && canResetAll && !sx.pickedUp;
                              return (
                                <li key={sx.id} className="px-3 py-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className={`w-24 flex-shrink-0 ${cancelled ? "text-slate-400 line-through" : "text-slate-700"}`}>
                                      {fmtDate(sx.date)}
                                    </span>
                                    <span className="w-12 flex-shrink-0 text-xs font-medium text-slate-500">
                                      {sx.mealType === "LUNCH" ? "Trưa" : "Tối"}
                                    </span>
                                    <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.text}</span>
                                    {dup && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Trùng buổi</span>}
                                    {sx.note && <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{sx.note}</span>}
                                    <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                                      {canMove && (
                                        <button
                                          onClick={() => moveDuplicate(s.id, sx.id)}
                                          disabled={movingId === sx.id}
                                          title="Chuyển buổi trùng này sang ngày trống gần nhất, bạn ấy vẫn đủ số buổi đã mua"
                                          className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                        >
                                          {movingId === sx.id ? "Đang dời..." : "Dời sang ngày trống"}
                                        </button>
                                      )}
                                      {canRemove &&
                                        (removeConfirmId === sx.id ? (
                                          <>
                                            <span className="text-red-700">
                                              {sx.status === "COMPLETED" || sx.pickedUp ? "Xóa buổi ĐÃ ĂN này?" : "Xóa buổi này?"}
                                            </span>
                                            <button
                                              onClick={() => removeSession(s.id, sx.id)}
                                              disabled={removingId === sx.id}
                                              className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                            >
                                              {removingId === sx.id ? "Đang xóa..." : "Xóa"}
                                            </button>
                                            <button
                                              onClick={() => setRemoveConfirmId(null)}
                                              className="rounded-lg border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
                                            >
                                              Thôi
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            onClick={() => setRemoveConfirmId(sx.id)}
                                            title={
                                              sx.status === "COMPLETED" || sx.pickedUp
                                                ? "Bỏ hẳn buổi đã ăn này, không bù (dùng khi ghi nhận nhầm hoặc trùng)"
                                                : "Bỏ hẳn buổi này, không bù (dùng khi đăng ký dư)"
                                            }
                                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                          >
                                            Xóa
                                          </button>
                                        ))}
                                      {canRestore &&
                                        (restoreConfirmId === sx.id ? (
                                          <>
                                            <span className="text-red-700">Khôi phục buổi này?</span>
                                            <button
                                              onClick={() => staffRestoreSession(s.id, sx.id)}
                                              disabled={restoringId === sx.id}
                                              className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                            >
                                              {restoringId === sx.id ? "Đang khôi phục..." : "Khôi phục"}
                                            </button>
                                            <button
                                              onClick={() => setRestoreConfirmId(null)}
                                              className="rounded-lg border border-slate-300 px-2.5 py-1 hover:bg-slate-50"
                                            >
                                              Thôi
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            onClick={() => setRestoreConfirmId(sx.id)}
                                            title={
                                              removed
                                                ? "Đưa buổi đã xóa trở lại lịch"
                                                : "Trả buổi về lịch và bỏ suất bù tương ứng (bỏ qua giờ chốt)"
                                            }
                                            className="rounded-lg border border-slate-300 px-2.5 py-1 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                                          >
                                            Khôi phục
                                          </button>
                                        ))}
                                    </span>
                                  </div>
                                </li>
                              );
                            })}
                        </ul>
                        {restoreError && <p className="mt-1 text-xs text-red-600">{restoreError}</p>}
                        {removeError && <p className="mt-1 text-xs text-red-600">{removeError}</p>}
                        {moveError && <p className="mt-1 text-xs text-red-600">{moveError}</p>}
                      </div>

                      {/* ---- 4. A meal the student ate that was never entered */}
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-3">
                        {missedOpenId === s.id ? (
                          <div className="space-y-2 animate-pop-in">
                            <p className="text-xs font-semibold text-slate-700">Ghi nhận buổi đã ăn nhưng chưa có trong lịch</p>
                            <p className="text-xs text-slate-500">
                              Dùng khi nhân viên quên đăng ký một buổi mà bạn ấy đã ăn (ví dụ chọn nhầm &quot;Bắt đầu từ tối&quot; dù
                              bạn ấy đã ăn trưa). Buổi được ghi là đã ăn, và hệ thống bớt 1 buổi cuối lịch để tổng số buổi không đổi. Ghi
                              nhận được cả bữa trưa lẫn tối.
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
                                      Gói từ {fmtDate(r.startDate)} ({r.totalSessions} buổi)
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
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-slate-500">Bạn ấy đã ăn một buổi mà chưa được ghi nhận?</p>
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
                              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              + Ghi nhận buổi đã ăn
                            </button>
                          </div>
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

const TILE_TONE = {
  red: "border-red-200 bg-red-50 text-red-700",
  green: "border-green-200 bg-green-50 text-green-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  slate: "border-slate-200 bg-white text-slate-600",
} as const;

/** One number of the student's summary at the top of the detail panel. */
function StatTile({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: keyof typeof TILE_TONE }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${TILE_TONE[tone]}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-2xl font-extrabold leading-tight">{value}</p>
      <p className="text-[11px] opacity-80">{hint}</p>
    </div>
  );
}
