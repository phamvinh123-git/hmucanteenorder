"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { foldText } from "@/lib/text";

const ACTION_LABEL: Record<string, string> = {
  LOGIN: "Đăng nhập",
  LOGOUT: "Đăng xuất",
  CHANGE_PASSWORD: "Đổi mật khẩu",
  UPDATE_PROFILE: "Cập nhật hồ sơ",
  CREATE_STUDENT_ACCOUNT: "Tạo tài khoản sinh viên",
  CREATE_REGISTRATION: "Đăng ký suất ăn",
  UPDATE_STUDENT_INFO: "Cập nhật thông tin sinh viên",
  UPDATE_STUDENT_PHONE: "Đổi SĐT sinh viên",
  RECORD_MISSED_SESSION: "Ghi nhận buổi ăn bị bỏ sót",
  REMOVE_SESSION: "Xóa buổi ăn",
  CANCEL_SESSION: "Hủy buổi ăn",
  RESTORE_SESSION: "Khôi phục buổi ăn",
  CANCEL_SESSIONS_BULK: "Hủy nhiều buổi ăn",
  RESTORE_SESSIONS_BULK: "Khôi phục nhiều buổi ăn",
  BULK_PICKUP: "Tích/bỏ tích đã lấy hàng loạt",
  MOVE_SESSION: "Đổi ngày buổi bù",
  DELETE_STUDENT: "Xóa sinh viên",
  RESET_ALL_STUDENTS: "Reset toàn bộ sinh viên",
  RESTORE_ARCHIVE: "Khôi phục bản lưu trữ",
  CREATE_USER: "Tạo tài khoản nhân sự",
  UPDATE_USER: "Cập nhật tài khoản",
  UPDATE_ORDER_CODE: "Sửa mã thứ tự",
  UPDATE_STUDENT_GROUP: "Sửa tổ",
  UPDATE_STUDENT_CLASS: "Sửa ngành/lớp",
  RESET_ORDER_CODES: "Reset mã thứ tự",
  BACKFILL_ORDER_CODES: "Gán mã cho SV chưa có mã",
};

const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export type LogRow = {
  id: string;
  action: string;
  detail: string | null;
  createdAt: string;
  userName: string;
};

export default function LogsView({ logs, limit }: { logs: LogRow[]; limit: number }) {
  const [search, setSearch] = useState("");

  const q = foldText(search);
  const visible = logs.filter((log) => {
    if (!q) return true;
    const label = ACTION_LABEL[log.action] ?? log.action;
    return (
      foldText(log.userName).includes(q) || foldText(label).includes(q) || foldText(log.detail ?? "").includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Nhật ký hoạt động" subtitle={`${limit} hoạt động gần nhất trong hệ thống.`} />

      <div className="flex flex-wrap items-center gap-2 animate-rise-in">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo người thực hiện, hành động hoặc nội dung..."
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100 sm:w-96"
        />
        <span className="text-xs text-slate-400">
          {search.trim() ? `${visible.length}/${logs.length} kết quả` : `${logs.length} hoạt động`}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100 animate-rise-in">
        {logs.length === 0 && <p className="p-4 text-sm text-slate-400">Chưa có hoạt động nào.</p>}
        {logs.length > 0 && visible.length === 0 && (
          <p className="p-4 text-sm text-slate-400">Không tìm thấy hoạt động nào khớp &quot;{search.trim()}&quot;.</p>
        )}
        {visible.map((log) => (
          <div
            key={log.id}
            className="p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 hover:bg-red-50/40 transition-colors"
          >
            <span className="text-slate-400 sm:w-40 flex-shrink-0">
              {dateTimeFmt.format(new Date(log.createdAt))}
            </span>
            <span className="font-medium text-slate-700 sm:w-40 flex-shrink-0">{log.userName}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 w-fit flex-shrink-0">
              {ACTION_LABEL[log.action] ?? log.action}
            </span>
            <span className="text-slate-500">{log.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
