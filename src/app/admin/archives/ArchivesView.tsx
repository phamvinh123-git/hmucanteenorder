"use client";

import { useEffect, useState } from "react";
import ConfirmModal from "@/components/ConfirmModal";

type Archive = {
  id: string;
  label: string;
  createdAt: string;
  createdByName: string;
  studentCount: number;
  sessionCount: number;
};

const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export default function ArchivesView() {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Archive | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/archives");
      const data = await res.json();
      if (res.ok) setArchives(data.archives);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  async function restore() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/archives/${target.id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "RESTORE" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Không thể khôi phục.");
        return;
      }
      setMessage(
        `Đã khôi phục ${data.students} sinh viên và ${data.sessions} buổi ăn.${
          data.safetyArchived ? " Dữ liệu sinh viên trước đó đã được lưu thành một bản lưu trữ mới." : ""
        }`,
      );
      setTarget(null);
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Lưu trữ sinh viên</h1>
        <p className="text-sm text-slate-500">
          Mỗi lần reset toàn bộ sinh viên, dữ liệu được lưu lại ở đây. Bạn có thể khôi phục bất cứ lúc nào.
        </p>
      </div>

      {message && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 animate-pop-in">{message}</p>}

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 animate-rise-in">
        {loading && <p className="p-4 text-sm text-slate-400">Đang tải...</p>}
        {!loading && archives.length === 0 && <p className="p-4 text-sm text-slate-400">Chưa có bản lưu trữ nào.</p>}
        {archives.map((a) => (
          <div key={a.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-red-50/40 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800">{a.label}</p>
              <p className="text-xs text-slate-400">
                {dateTimeFmt.format(new Date(a.createdAt))} · bởi {a.createdByName}
              </p>
            </div>
            <p className="text-sm text-slate-600">
              {a.studentCount} sinh viên · {a.sessionCount} buổi ăn
            </p>
            <button
              onClick={() => {
                setTarget(a);
                setError(null);
                setMessage(null);
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              Khôi phục
            </button>
          </div>
        ))}
      </div>

      {target && (
        <ConfirmModal
          title="Khôi phục bản lưu trữ?"
          confirmWord="RESTORE"
          confirmLabel="Khôi phục"
          busy={busy}
          error={error}
          onConfirm={restore}
          onClose={() => setTarget(null)}
        >
          <p>
            Bản lưu: <b>{target.label}</b> ({target.studentCount} sinh viên, {target.sessionCount} buổi ăn).
          </p>
          <p>
            Danh sách sinh viên <b>hiện tại sẽ được thay thế</b> bằng bản này. Để an toàn, dữ liệu hiện tại (nếu có) sẽ
            tự động được lưu thành một bản lưu trữ mới trước khi khôi phục.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
