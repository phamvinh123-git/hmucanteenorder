"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu mới nhập lại không khớp.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Đổi mật khẩu thất bại.");
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white shadow-sm border border-red-100 rounded-xl p-6 space-y-4 animate-rise-in"
      style={{ animationDelay: "80ms" }}
    >
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu hiện tại</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu mới</label>
        <input
          type="password"
          required
          minLength={4}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Nhập lại mật khẩu mới</label>
        <input
          type="password"
          required
          minLength={4}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
        />
      </div>
      {error && <p className="text-sm text-red-600 animate-pop-in">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-red-600 text-white py-2 text-sm font-medium shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
      >
        {loading ? "Đang lưu..." : "Đổi mật khẩu"}
      </button>
    </form>
  );
}
