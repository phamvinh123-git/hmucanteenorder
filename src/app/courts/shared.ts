import { localDateKey } from "@/lib/client-session-rules";

// Small helpers and look-and-feel constants shared by the pieces of the "Đặt sân" screen.

export type Mode = "approval" | "instant" | null;
export type Status = "PENDING" | "UNION_APPROVED" | "APPROVED" | "REJECTED" | "CANCELLED";

export const STATUS_LABEL: Record<Status, string> = {
  PENDING: "Chờ Liên chi đoàn duyệt",
  UNION_APPROVED: "Chờ quản lý sân duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị từ chối",
  CANCELLED: "Đã hủy",
};
export const STATUS_STYLE: Record<Status, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  UNION_APPROVED: "bg-blue-50 text-blue-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export const input =
  "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100";
export const btnPrimary = "rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50";
export const btnGhost = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** "2026-11-24" as "T3 24/11". */
export function fmtKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${WEEKDAY[new Date(y, m - 1, d).getDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
export function fmtIso(iso: string) {
  return fmtKey(localDateKey(new Date(iso)));
}

/** The weekday (0 = Sunday ... 6 = Saturday) of a "2026-11-24" key. */
export function dayOfKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export async function call(path: string, init?: RequestInit) {
  try {
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data } as { ok: boolean; data: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch {
    return { ok: false, data: { error: "Không kết nối được máy chủ, thử lại." } } as { ok: boolean; data: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}
export const post = (path: string, body: unknown) =>
  call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export const patch = (path: string, body: unknown) =>
  call(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
