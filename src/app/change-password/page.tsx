import { requireUser } from "@/lib/guard";
import { homePathForRole } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowPendingPasswordChange: true });

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-rise-in">
        <div className="text-center mb-6">
          <h1 className="text-lg font-bold text-slate-800">Đổi mật khẩu</h1>
          {user.mustChangePassword && (
            <p className="text-slate-500 text-sm mt-1">
              Đây là lần đăng nhập đầu tiên, bạn cần đặt mật khẩu mới trước khi tiếp tục.
            </p>
          )}
        </div>
        <ChangePasswordForm redirectTo={homePathForRole(user.role)} />
      </div>
    </div>
  );
}
