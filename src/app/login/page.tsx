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
          {/* One line, in the two colours of the campus logo: red, then blue. */}
          <h1 className="whitespace-nowrap text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            <span className="text-[#be1651]">HMU THC</span> <span className="text-[#0556a2]">Canteen</span>
          </h1>
          <p className="mt-2 text-base font-medium text-slate-500 sm:text-lg">Hệ thống đặt ăn tại Canteen</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
