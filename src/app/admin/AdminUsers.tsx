"use client";

import PageHeader from "@/components/PageHeader";
import { useEffect, useState } from "react";
import { foldText } from "@/lib/text";

type Role = "ADMIN" | "MANAGER" | "SALES" | "STUDENT" | "OFFICER";

type UserRow = {
  id: string;
  name: string;
  phone: string;
  staffCode: string | null;
  isOfficer: boolean;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  MANAGER: "Quản lý",
  SALES: "Bán hàng",
  STUDENT: "Sinh viên",
  OFFICER: "Cán bộ",
};

const emptyForm = { name: "", phone: "", staffCode: "", alsoOfficer: false, password: "123", role: "SALES" as "ADMIN" | "MANAGER" | "SALES" | "OFFICER" };

export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<"ALL" | Role>("ALL");
  const [search, setSearch] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingResetId, setConfirmingResetId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "Không thể tạo tài khoản.");
        return;
      }
      setForm(emptyForm);
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  // Correcting a wrong phone number or staff code (shown under the row when "Sửa đăng nhập" is pressed).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editBusy, setEditBusy] = useState(false);

  function startEdit(u: UserRow) {
    setEditingId(u.id);
    // An officer without a phone of their own has the code as a placeholder: show the phone blank.
    setEditPhone(u.staffCode && u.phone === u.staffCode ? "" : u.phone);
    setEditCode(u.staffCode ?? "");
    setEditError(null);
  }

  async function saveEdit(u: UserRow) {
    setEditBusy(true);
    setEditError(null);
    try {
      const body: Record<string, string> = { phone: editPhone.trim() };
      if (u.role !== "STUDENT") body.staffCode = editCode.trim();
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Không thể lưu.");
        return;
      }
      setEditingId(null);
      load();
    } finally {
      setEditBusy(false);
    }
  }

  const q = foldText(search);
  const visible = users.filter(
    (u) =>
      // The "Cán bộ" filter also lists managers/sales/admins who are officers too (one login, two roles).
      (roleFilter === "ALL" || u.role === roleFilter || (roleFilter === "OFFICER" && u.isOfficer)) &&
      (!q ||
        foldText(u.name).includes(q) ||
        u.phone.includes(search.trim()) ||
        (u.staffCode ?? "").toLowerCase().includes(search.trim().toLowerCase())),
  );

  return (
    <div className="space-y-8">
      <PageHeader title="Quản lý tài khoản" subtitle="Toàn quyền tạo, khóa và phân quyền tài khoản trong hệ thống." />

      <section>
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Tạo tài khoản nhân sự mới</h2>
        <form
          onSubmit={onCreate}
          className="bg-white border border-slate-200 border-t-4 border-t-red-500 rounded-2xl shadow-sm p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-rise-in"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tên</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
          {(form.role === "OFFICER" || form.alsoOfficer) && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Mã cán bộ (đăng nhập){form.role === "OFFICER" ? "" : " — không bắt buộc"}
              </label>
              <input
                required={form.role === "OFFICER"}
                value={form.staffCode}
                onChange={(e) => setForm({ ...form, staffCode: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {form.role === "OFFICER" ? "Số điện thoại (không bắt buộc)" : "Số điện thoại"}
            </label>
            <input
              required={form.role !== "OFFICER"}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mật khẩu ban đầu</label>
            <input
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vai trò</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              <option value="ADMIN">Quản trị viên</option>
              <option value="MANAGER">Quản lý</option>
              <option value="SALES">Bán hàng</option>
              <option value="OFFICER">Cán bộ</option>
            </select>
            {form.role !== "OFFICER" && (
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={form.alsoOfficer}
                  onChange={(e) => setForm({ ...form, alsoOfficer: e.target.checked })}
                  className="h-4 w-4 accent-red-600"
                />
                Đồng thời là cán bộ (đặt cơm trưa)
              </label>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
            >
              {submitting ? "Đang tạo..." : "Tạo tài khoản"}
            </button>
            {formError && <p className="text-sm text-red-600 animate-pop-in">{formError}</p>}
          </div>
        </form>
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Danh sách tài khoản
            {!loading && <span className="ml-2 font-normal text-slate-400">({visible.length})</span>}
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc số điện thoại..."
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100 sm:w-64"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
          >
            <option value="ALL">Tất cả vai trò</option>
            <option value="ADMIN">Quản trị viên</option>
            <option value="MANAGER">Quản lý</option>
            <option value="SALES">Bán hàng</option>
            <option value="STUDENT">Sinh viên</option>
<option value="OFFICER">Cán bộ</option>
          </select>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100">
          {loading && <p className="p-4 text-sm text-slate-400">Đang tải...</p>}
          {!loading && visible.length === 0 && (
            <p className="p-4 text-sm text-slate-400">
              {search.trim() ? `Không tìm thấy tài khoản nào khớp "${search.trim()}".` : "Không có tài khoản."}
            </p>
          )}
          {visible.map((u, i) => (
            <div
              key={u.id}
              className="p-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 animate-rise-in hover:bg-red-50/40 transition-colors"
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            >
              <div className="sm:w-56">
                <p className="text-sm font-medium text-slate-800">{u.name}</p>
                <p className="text-xs text-slate-400">
                  {u.staffCode ? `Mã CB: ${u.staffCode}${u.phone !== u.staffCode ? ` · ${u.phone}` : ""}` : u.phone}
                </p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 w-fit">{ROLE_LABEL[u.role]}</span>
              {u.isOfficer && u.role !== "OFFICER" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 w-fit" title="Tài khoản này cũng đặt cơm trưa như cán bộ">
                  + Cán bộ
                </span>
              )}
              {!u.active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 w-fit">Đã khóa</span>}
              {u.mustChangePassword && u.role === "STUDENT" && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 w-fit"
                  title="Sinh viên chưa đổi mật khẩu nên vẫn dùng mật khẩu mặc định"
                >
                  Chưa đổi MK · mật khẩu là <span className="font-mono font-semibold">123</span>
                </span>
              )}
              {u.mustChangePassword && u.role !== "STUDENT" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 w-fit">Chưa đổi MK</span>
              )}
              {!u.mustChangePassword && u.role === "STUDENT" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 w-fit">Đã tự đặt mật khẩu</span>
              )}
              <div className="flex-1" />
              <div className="flex gap-2">
                <button
                  onClick={() => patchUser(u.id, { active: !u.active })}
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  {u.active ? "Khóa" : "Mở khóa"}
                </button>
                {confirmingResetId === u.id ? (
                  <>
                    <button
                      onClick={() => {
                        setConfirmingResetId(null);
                        patchUser(u.id, { resetPassword: true });
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 animate-pop-in"
                    >
                      Xác nhận reset
                    </button>
                    <button
                      onClick={() => setConfirmingResetId(null)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 animate-pop-in"
                    >
                      Thôi
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmingResetId(u.id)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                  >
                    Reset mật khẩu
                  </button>
                )}
                {(u.role === "ADMIN" || u.role === "MANAGER" || u.role === "SALES") && (
                  <button
                    onClick={() => patchUser(u.id, { isOfficer: !u.isOfficer })}
                    title={
                      u.isOfficer
                        ? "Bỏ quyền đặt cơm trưa như cán bộ của tài khoản này"
                        : "Cho tài khoản này đặt cơm trưa như cán bộ (vẫn dùng chung một đăng nhập)"
                    }
                    className={`text-xs px-3 py-1.5 rounded-lg border ${
                      u.isOfficer
                        ? "border-red-300 bg-red-50 text-red-700"
                        : "border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    }`}
                  >
                    {u.isOfficer ? "Bỏ cán bộ" : "Đặt làm cán bộ"}
                  </button>
                )}
                <button
                  onClick={() => (editingId === u.id ? setEditingId(null) : startEdit(u))}
                  title="Sửa số điện thoại hoặc mã cán bộ nếu nhập sai"
                  className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                >
                  {editingId === u.id ? "Đóng" : "Sửa đăng nhập"}
                </button>
                <select
                  value={u.role}
                  onChange={(e) => patchUser(u.id, { role: e.target.value })}
                  className="text-xs rounded-lg border border-slate-300 px-2 py-1.5 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
                >
                  <option value="ADMIN">Quản trị viên</option>
                  <option value="MANAGER">Quản lý</option>
                  <option value="SALES">Bán hàng</option>
                  <option value="STUDENT">Sinh viên</option>
<option value="OFFICER">Cán bộ</option>
                </select>
              </div>
              {editingId === u.id && (
                <div className="basis-full rounded-xl bg-red-50/60 p-3 animate-pop-in">
                  <p className="mb-2 text-xs text-slate-500">
                    Sửa thông tin dùng để đăng nhập của <b>{u.name}</b>. Số điện thoại và mã cán bộ đều đăng nhập được, nên
                    không được trùng với tài khoản khác.
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs font-medium text-slate-600">
                      Số điện thoại
                      <input
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value.replace(/[^0-9]/g, ""))}
                        inputMode="numeric"
                        placeholder={u.isOfficer || u.role === "OFFICER" ? "Để trống nếu chưa có" : ""}
                        className="mt-1 block w-44 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                      />
                    </label>
                    {u.role !== "STUDENT" && (
                      <label className="text-xs font-medium text-slate-600">
                        Mã cán bộ{u.isOfficer || u.role === "OFFICER" ? "" : " (nhập để đặt làm cán bộ)"}
                        <input
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                          className="mt-1 block w-40 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm uppercase outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                        />
                      </label>
                    )}
                    <button
                      onClick={() => saveEdit(u)}
                      disabled={editBusy}
                      className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
                    >
                      {editBusy ? "Đang lưu..." : "Lưu"}
                    </button>
                    {editError && <span className="text-xs text-red-600">{editError}</span>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
