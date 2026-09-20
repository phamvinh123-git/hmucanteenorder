"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { classLevelsFor, MAJORS } from "@/lib/student-info";

type Initial = {
  name: string;
  phone: string;
  orderCode: number | null;
  major: string | null;
  className: string | null;
};

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-slate-300 hover:border-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-100";
const labelCls = "mb-1.5 block text-xs font-semibold text-slate-600";

export default function ProfileForm({ role, initial }: { role: string; initial: Initial }) {
  const router = useRouter();
  const isStudent = role === "STUDENT";
  const isAdmin = role === "ADMIN";
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [major, setMajor] = useState(initial.major ?? "");
  const [className, setClassName] = useState(initial.className ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isStudent
            ? { name, major: major || null, className: className || null }
            : isAdmin
              ? { name, phone }
              : { name },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không thể lưu thông tin.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Hồ sơ cá nhân" subtitle="Xem và cập nhật thông tin của bạn." />

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm animate-rise-in">
        <div>
          <label className={labelCls}>Họ và tên</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Số điện thoại (tên đăng nhập)</label>
            {isAdmin ? (
              <>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/D/g, ""))}
                  inputMode="numeric"
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-slate-400">Lần đăng nhập sau dùng số này.</p>
              </>
            ) : (
              <>
                <input value={initial.phone} readOnly className={`${inputCls} bg-slate-50 text-slate-500`} />
                <p className="mt-1 text-xs text-slate-400">Cần đổi số điện thoại, vui lòng liên hệ bộ phận bán hàng.</p>
              </>
            )}
          </div>
          {isStudent && (
            <div>
              <label className={labelCls}>Số thứ tự</label>
              <input
                value={initial.orderCode ?? "Chưa có"}
                readOnly
                className={`${inputCls} bg-slate-50 font-mono text-slate-500`}
              />
              <p className="mt-1 text-xs text-slate-400">Do bộ phận bán hàng cấp.</p>
            </div>
          )}
        </div>

        {isStudent && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Ngành</label>
              <select
                value={major}
                onChange={(e) => {
                  const next = e.target.value;
                  setMajor(next);
                  if (!classLevelsFor(next).includes(className)) setClassName("");
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
              <label className={labelCls}>Lớp</label>
              <select
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                disabled={!major}
                className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
              >
                <option value="">{major ? "Chọn lớp" : "Chọn ngành trước"}</option>
                {classLevelsFor(major).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-slate-200 pt-5">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
          <Link href="/change-password" className="text-sm text-slate-500 hover:text-red-600">
            Đổi mật khẩu
          </Link>
          {saved && <span className="text-sm text-green-600 animate-pop-in">Đã lưu thông tin.</span>}
          {error && <span className="text-sm text-red-600 animate-pop-in">{error}</span>}
        </div>
      </form>
    </div>
  );
}
