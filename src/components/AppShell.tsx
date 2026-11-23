import Link from "next/link";
import Image from "next/image";
import AppNav, { MobileTabs, type NavGroup } from "./AppNav";
import UserMenu from "./UserMenu";
import IdleScreen from "./IdleScreen";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { servicesFor } from "@/lib/services";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  MANAGER: "Quản lý căng tin",
  SALES: "Bán hàng",
  STUDENT: "Sinh viên",
  OFFICER: "Cán bộ",
  CANTEEN_SUPPORT: "Hỗ trợ căng tin",
  UNION: "Liên chi đoàn",
  SERVICE_HEAD: "Tổ trưởng tổ dịch vụ",
  COURT_MANAGER: "Quản lý đặt sân",
};

export default async function AppShell({
  role,
  name,
  children,
}: {
  role: Role;
  name: string;
  children: React.ReactNode;
}) {
  // A manager, salesperson or admin who is also an officer (cán bộ) keeps their own menu and gets the
  // lunch-ordering page as one more entry.
  const session = await getSession();
  const officerToo =
    role !== "OFFICER" &&
    role !== "STUDENT" &&
    !!session &&
    !!(await prisma.user.findUnique({ where: { id: session.userId }, select: { isOfficer: true } }))?.isOfficer;
  // The services this account uses; the menu (and the tabs inside the current service) is built from them.
  const groups: NavGroup[] = servicesFor(role).map((svc) => ({
    key: svc.key,
    title: svc.title,
    icon: svc.icon,
    href: svc.href,
    paths: svc.paths,
    items:
      svc.key === "canteen" && officerToo ? [...svc.items, { href: "/officer", label: "Đặt cơm trưa" }] : svc.items,
  }));

  return (
    <div className="min-h-screen">
      <IdleScreen />
      <header className="print:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="h-1 bg-gradient-to-r from-red-700 via-red-400 to-red-700" />
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-2">
          <Link href="/" className="flex flex-shrink-0 items-center gap-3">
            <Image
              src="/logo.webp"
              alt="Đại học Y Hà Nội - Phân hiệu Thanh Hóa"
              width={44}
              height={44}
              className="h-10 w-10 flex-shrink-0 rounded-full object-cover bg-white animate-logo-glow logo-spin-hover"
            />
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-bold text-red-700">Căng tin Phân hiệu</span>
              <span className="block text-xs text-slate-500">ĐHYHN Thanh Hóa</span>
            </span>
          </Link>
          <AppNav groups={groups} />
          <div className="ml-auto">
            <UserMenu name={name} roleLabel={ROLE_LABEL[role]} />
          </div>
        </div>
        <MobileTabs groups={groups} />
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 animate-rise-in">
        {children}
      </main>
    </div>
  );
}
