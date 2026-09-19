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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-red-50 px-4">
      <div className="w-full max-w-sm animate-rise-in">
        <div className="text-center mb-8">
          <Image
            src="/logo.webp"
            alt="Đại học Y Hà Nội - Phân hiệu Thanh Hóa"
            width={96}
            height={96}
            priority
            className="mx-auto mb-4 h-24 w-24 animate-pop-in"
          />
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
