"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Đăng nhập thất bại.");
        return;
      }
      if (data.mustChangePassword) {
        router.push("/change-password");
      } else {
        const homeByRole: Record<string, string> = {
          ADMIN: "/admin",
          MANAGER: "/manager",
          SALES: "/sales",
          STUDENT: "/student",
        };
        router.push(homeByRole[data.role] ?? "/");
      }
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
        <label className="block text-sm font-medium text-slate-700 mb-1">Số điện thoại</label>
        <input
          type="text"
          inputMode="numeric"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
          placeholder="09xxxxxxxx"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
          placeholder="Mật khẩu"
        />
      </div>
      {error && <p className="text-sm text-red-600 animate-pop-in">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-red-600 text-white py-2 text-sm font-medium shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
      >
        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
      <p className="text-xs text-slate-400 text-center">
        Sinh viên mới dùng mật khẩu mặc định <span className="font-mono text-red-500">123</span> do bộ phận bán hàng cấp.
      </p>
    </form>
  );
}
