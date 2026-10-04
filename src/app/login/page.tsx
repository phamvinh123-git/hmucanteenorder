import { getSession, homePathForRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Image from "next/image";
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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-rise-in">
        <div className="text-center mb-8">
          <Image
            src="/logo.webp"
            alt="Đại học Y Hà Nội - Phân hiệu Thanh Hóa"
            width={120}
            height={120}
            priority
            className="mx-auto mb-5 h-28 w-28 rounded-full object-cover bg-white animate-logo-float"
          />
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-600">Đại học Y Hà Nội</p>
          <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight text-slate-800 sm:text-4xl">
            Phân hiệu Thanh Hóa
          </h1>
          <p className="mt-2 text-lg font-semibold text-red-600 sm:text-xl">Hệ thống đặt suất ăn căng tin</p>
          <p className="mt-3 text-sm text-slate-500">Đăng nhập để đăng ký và quản lý suất ăn của bạn</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
