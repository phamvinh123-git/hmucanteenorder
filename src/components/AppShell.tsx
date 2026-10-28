import Link from "next/link";
import Image from "next/image";
import NavLinks from "./NavLinks";
import UserMenu from "./UserMenu";
import IdleScreen from "./IdleScreen";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const NAV_ITEMS: { role: Role; href: string; label: string }[] = [
  { role: "STUDENT", href: "/student", label: "Đặt suất ăn" },
  { role: "OFFICER", href: "/officer", label: "Đặt cơm trưa" },
  { role: "SALES", href: "/sales", label: "Bán hàng" },
  { role: "SALES", href: "/schedule", label: "Lịch tuần" },
  { role: "SALES", href: "/report", label: "Báo cáo" },
  { role: "MANAGER", href: "/manager", label: "Bán hàng" },
  { role: "MANAGER", href: "/schedule", label: "Lịch tuần" },
  { role: "MANAGER", href: "/manager/stats", label: "Thống kê" },
  { role: "MANAGER", href: "/report", label: "Báo cáo" },
  { role: "MANAGER", href: "/costly", label: "Giá vốn" },
  { role: "ADMIN", href: "/sales", label: "Bán hàng" },
  { role: "ADMIN", href: "/schedule", label: "Lịch tuần" },
  { role: "ADMIN", href: "/manager/stats", label: "Thống kê" },
  { role: "ADMIN", href: "/report", label: "Báo cáo" },
  { role: "ADMIN", href: "/costly", label: "Giá vốn" },
  { role: "ADMIN", href: "/admin", label: "Tài khoản" },
  { role: "ADMIN", href: "/admin/archives", label: "Lưu trữ" },
  { role: "ADMIN", href: "/admin/logs", label: "Nhật ký" },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  MANAGER: "Quản lý",
  SALES: "Bán hàng",
  STUDENT: "Sinh viên",
  OFFICER: "Cán bộ",
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
  const items = NAV_ITEMS.filter((i) => i.role === role);

  // A manager, salesperson or admin who is also an officer (cán bộ) keeps their own menu and gets the
  // lunch-ordering page as one more entry.
  const session = await getSession();
  const officerToo =
    role !== "OFFICER" &&
    role !== "STUDENT" &&
    !!session &&
    !!(await prisma.user.findUnique({ where: { id: session.userId }, select: { isOfficer: true } }))?.isOfficer;
  if (officerToo) items.push({ role, href: "/officer", label: "Đặt cơm trưa" });

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
          <NavLinks items={items} className="ml-2 hidden flex-1 md:flex" />
          <div className="ml-auto md:ml-0">
            <UserMenu name={name} roleLabel={ROLE_LABEL[role]} />
          </div>
        </div>
        <NavLinks items={items} className="no-scrollbar mx-auto max-w-6xl overflow-x-auto px-4 pb-2 md:hidden" />
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 animate-rise-in">
        {children}
      </main>
    </div>
  );
}
