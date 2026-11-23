"use client";

import { useState } from "react";
import { addDays } from "date-fns";
import { localDateKey } from "@/lib/client-session-rules";

type Result = {
  day: string;
  applied: boolean;
  students: number;
  studentMeals: number;
  officers: number;
  officerMeals: number;
  cancelledStudent: number;
  cancelledOfficer: number;
  makeups: number;
  failed: { name: string; error: string }[];
};

const fmt = (key: string) => key.split("-").reverse().join("/");

/** "Nghỉ cả ngày": the school is closed (a holiday), so every meal booked that day is cancelled in one go. */
export default function CloseDayTool({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(() => localDateKey(addDays(new Date(), 1)));
  const [reason, setReason] = useState("Ngày Văn hóa Việt Nam");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);

  async function run(apply: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sessions/close-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, apply, reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Không thực hiện được.");
        return;
      }
      if (apply) {
        setDone(data);
        setPreview(null);
        onDone?.();
      } else {
        setPreview(data);
      }
    } catch {
      setError("Không kết nối được máy chủ, thử lại.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setPreview(null);
    setDone(null);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        title="Trường nghỉ: hủy toàn bộ cơm của một ngày (sinh viên được bù buổi)"
      >
        🎌 Nghỉ cả ngày
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800">Hủy cơm cả ngày (trường nghỉ)</h3>
            <p className="mt-1 text-xs text-slate-500">
              Hủy mọi suất ăn của ngày được chọn. Sinh viên được bù đủ số buổi đã hủy (xếp vào cuối lịch, không rơi vào ngày nghỉ); cán bộ chỉ bị
              hủy suất trưa, không bù.
            </p>

            {done ? (
              <div className="mt-4 space-y-2">
                <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                  Đã hủy cơm ngày {fmt(done.day)}: {done.cancelledStudent} buổi của sinh viên (đã bù {done.makeups} buổi) và {done.cancelledOfficer} buổi
                  của cán bộ.
                </p>
                {done.failed.length > 0 && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                    <p className="font-semibold">{done.failed.length} buổi không hủy được:</p>
                    <ul className="mt-1 list-disc pl-4">
                      {done.failed.slice(0, 10).map((f, i) => (
                        <li key={i}>
                          {f.name}: {f.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex justify-end">
                  <button type="button" onClick={close} className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700">
                    Xong
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Ngày nghỉ
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setPreview(null);
                      }}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Lý do (ghi vào nhật ký)
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    />
                  </label>
                </div>

                {preview && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Ngày {fmt(preview.day)} có <b>{preview.studentMeals}</b> buổi của <b>{preview.students}</b> sinh viên (mỗi buổi sẽ được bù) và{" "}
                    <b>{preview.officerMeals}</b> suất của <b>{preview.officers}</b> cán bộ.
                    {preview.studentMeals + preview.officerMeals === 0 && " Không có suất nào cần hủy."}
                  </div>
                )}
                {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={busy || !date}
                    onClick={() => run(false)}
                    className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {busy && !preview ? "Đang kiểm tra..." : "Xem trước"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !preview || preview.studentMeals + preview.officerMeals === 0}
                    onClick={() => run(true)}
                    className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy && preview ? "Đang hủy..." : "Hủy cơm & bù buổi"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
