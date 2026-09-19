import { getSession, homePathForRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    // Only redirect for a still-valid account. A stale cookie (account
    // deleted/deactivated since the token was issued) falls through to the
    // form below instead of trusting the JWT payload — otherwise this page
    // and the protected-page guard would redirect to each other forever.
    // The cookie itself is harmless; it gets overwritten on the next login.
    if (user && user.active) {
      redirect(homePathForRole(user.role));
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-red-50 px-4">
      <div className="w-full max-w-sm animate-rise-in">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-red-600 flex items-center justify-center shadow-lg shadow-red-200 animate-pop-in">
            <span className="text-white text-xl font-bold">HN</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">
            Căng tin Phân hiệu Đại học Y Hà Nội
          </h1>
          <p className="text-red-600 text-sm mt-1 font-medium">tại Thanh Hóa</p>
          <p className="text-slate-400 text-xs mt-3">Hệ thống đặt suất ăn</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
