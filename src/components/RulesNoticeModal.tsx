"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { classLevelsFor, MAJORS } from "@/lib/student-info";

const RULES_FLAG = "canteenRulesPending";

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-100";

/**
 * Blocks the student dashboard behind up to two steps, in order:
 * 1. "profile" — only while major/className are missing, e.g. an imported roster account that
 *    never had them set. Persists across logins/refreshes until filled in, then never shows again.
 * 2. "rules" — the meal-rules notice, shown once per login (existing behaviour).
 */
export default function RulesNoticeModal({ major, className }: { major: string | null; className: string | null }) {
  const [profileDone, setProfileDone] = useState(!!(major && className));
  const [rulesPending, setRulesPending] = useState(false);

  const [formMajor, setFormMajor] = useState(major ?? "");
  const [formClass, setFormClass] = useState(className ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the post-login flag on mount
      if (sessionStorage.getItem(RULES_FLAG)) setRulesPending(true);
    } catch {}
  }, []);

  const step: "profile" | "rules" | null = !profileDone ? "profile" : rulesPending ? "rules" : null;

  useEffect(() => {
    if (!step) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [step]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!formMajor || !formClass) {
      setError("Vui lòng chọn cả ngành và lớp.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ major: formMajor, className: formClass }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không thể lưu thông tin.");
        return;
      }
      setProfileDone(true);
    } finally {
      setSaving(false);
    }
  }

  function acknowledgeRules() {
    try {
      sessionStorage.removeItem(RULES_FLAG);
    } catch {}
    setRulesPending(false);
  }

  if (!step) return null;

  // Portal to <body>: an ancestor with a CSS transform (the page entrance animation) would otherwise anchor `fixed` to itself.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={step === "profile" ? "Hoàn thiện hồ sơ" : "Lưu ý khi đăng ký/hủy suất ăn"}
    >
      {step === "profile" ? (
        <form
          onSubmit={saveProfile}
          className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-pop-in"
        >
          <div className="bg-gradient-to-r from-red-600 to-red-500 px-5 py-4 text-white">
            <h2 className="text-lg font-bold leading-tight">📋 Hoàn thiện hồ sơ</h2>
            <p className="mt-1 text-sm text-red-100">Vui lòng chọn ngành và lớp trước khi vào hệ thống.</p>
          </div>

          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Ngành</label>
              <select
                autoFocus
                value={formMajor}
                onChange={(e) => {
                  const next = e.target.value;
                  setFormMajor(next);
                  if (!classLevelsFor(next).includes(formClass)) setFormClass("");
                }}
                className={inputCls}
              >
                <option value="">Chọn ngành</option>
                {MAJORS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Lớp</label>
              <select
                value={formClass}
                onChange={(e) => setFormClass(e.target.value)}
                disabled={!formMajor}
                className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
              >
                <option value="">{formMajor ? "Chọn lớp" : "Chọn ngành trước"}</option>
                {classLevelsFor(formMajor).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600 animate-pop-in">{error}</p>}
          </div>

          <div className="border-t border-slate-100 px-5 py-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
            >
              {saving ? "Đang lưu..." : "Lưu và tiếp tục"}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-pop-in">
          <div className="bg-gradient-to-r from-red-600 to-red-500 px-5 py-4 text-white">
            <h2 className="text-lg font-bold leading-tight">📣 LƯU Ý KHI ĐĂNG KÝ/HỦY SUẤT ĂN</h2>
            <p className="mt-1 text-sm text-red-100">🔔 Quy định này áp dụng từ ngày 22/9/2026.</p>
          </div>

          <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-700">
            <p>Các bạn vui lòng kiểm tra kỹ ngày và số suất ăn trước khi xác nhận đăng ký.</p>
            <p>
              🔹 Nếu không có nhu cầu sử dụng, vui lòng <b>HỦY BỮA</b> trên App trước thời gian chốt suất ăn:
            </p>
            <div className="space-y-2 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700">
              <p>🍚 Hủy ăn trưa: trước 09h00</p>
              <p>🍚 Hủy ăn tối: trước 15h00</p>
            </div>
            <p>
              ⚠️ Sau thời gian trên, hệ thống chốt suất ăn để Nhà ăn chuẩn bị nguyên liệu nên{" "}
              <b>không thể hủy và không hoàn tiền</b>.
            </p>
            <p>
              👉 Mong các bạn thực hiện đúng thời gian để hạn chế suất ăn bị bỏ, đồng thời giúp Nhà ăn chuẩn bị đầy đủ
              và phục vụ tốt nhất.
            </p>
            <p>Xin cảm ơn các bạn! ❤️</p>
          </div>

          <div className="border-t border-slate-100 px-5 py-4">
            <button
              onClick={acknowledgeRules}
              autoFocus
              className="w-full rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
            >
              Tôi đã đọc và đồng ý
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
