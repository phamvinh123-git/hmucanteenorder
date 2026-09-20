import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";

const ACTION_LABEL: Record<string, string> = {
  LOGIN: "Đăng nhập",
  LOGOUT: "Đăng xuất",
  CHANGE_PASSWORD: "Đổi mật khẩu",
  CREATE_STUDENT_ACCOUNT: "Tạo tài khoản sinh viên",
  CREATE_REGISTRATION: "Đăng ký suất ăn",
  CANCEL_SESSION: "Hủy buổi ăn",
  RESTORE_SESSION: "Khôi phục buổi ăn",
  MOVE_SESSION: "Đổi ngày buổi bù",
  CREATE_USER: "Tạo tài khoản nhân sự",
  UPDATE_USER: "Cập nhật tài khoản",
  UPDATE_ORDER_CODE: "Sửa mã thứ tự",
  UPDATE_STUDENT_GROUP: "Sửa tổ",
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

export default async function LogsPage() {
  const user = await requireUser({ roles: ["ADMIN"] });

  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true, role: true } } },
  });

  return (
    <AppShell role={user.role} name={user.name}>
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Nhật ký hoạt động</h1>
          <p className="text-sm text-slate-500">300 hoạt động gần nhất trong hệ thống.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 animate-rise-in">
          {logs.length === 0 && <p className="p-4 text-sm text-slate-400">Chưa có hoạt động nào.</p>}
          {logs.map((log) => (
            <div
              key={log.id}
              className="p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 hover:bg-red-50/40 transition-colors"
            >
              <span className="text-slate-400 sm:w-40 flex-shrink-0">{dateTimeFmt.format(log.createdAt)}</span>
              <span className="font-medium text-slate-700 sm:w-40 flex-shrink-0">
                {log.user?.name ?? "Hệ thống"}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 w-fit">
                {ACTION_LABEL[log.action] ?? log.action}
              </span>
              <span className="text-slate-500">{log.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
