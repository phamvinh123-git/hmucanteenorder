import { getSession, homePathForRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Image from "next/image";
import { Be_Vietnam_Pro } from "next/font/google";
import LoginForm from "./LoginForm";

// A font drawn for Vietnamese, so every tone mark renders correctly (the default font lacks glyphs for them).
const titleFont = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["600", "800"], display: "swap" });

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
          {/* Red-to-blue text (the campus logo colours) with the colours sweeping left to right. */}
          <h1
            className={`${titleFont.className} title-gradient whitespace-nowrap pb-1 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl`}
          >
            HMU THC Canteen
          </h1>
          <p className={`${titleFont.className} title-gradient mt-1 pb-1 text-base font-semibold sm:text-lg`}>
            Hệ thống đặt ăn tại Canteen
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
