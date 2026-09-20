import Link from "next/link";
import Image from "next/image";
import LogoutButton from "./LogoutButton";
import { Role } from "@prisma/client";

const NAV_ITEMS: { role: Role; href: string; label: string }[] = [
  { role: "STUDENT", href: "/student", label: "Đặt suất ăn" },
  { role: "SALES", href: "/sales", label: "Bán hàng" },
  { role: "SALES", href: "/schedule", label: "Lịch tuần" },
  { role: "SALES", href: "/report", label: "Báo cáo" },
  { role: "MANAGER", href: "/manager", label: "Bán hàng" },
  { role: "MANAGER", href: "/schedule", label: "Lịch tuần" },
  { role: "MANAGER", href: "/manager/stats", label: "Thống kê" },
  { role: "MANAGER", href: "/report", label: "Báo cáo" },
  { role: "ADMIN", href: "/sales", label: "Bán hàng" },
  { role: "ADMIN", href: "/schedule", label: "Lịch tuần" },
  { role: "ADMIN", href: "/manager/stats", label: "Thống kê" },
  { role: "ADMIN", href: "/report", label: "Báo cáo" },
  { role: "ADMIN", href: "/admin", label: "Tài khoản" },
  { role: "ADMIN", href: "/admin/logs", label: "Nhật ký" },
];

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  MANAGER: "Quản lý",
  SALES: "Bán hàng",
  STUDENT: "Sinh viên",
};

export default function AppShell({
  role,
  name,
  children,
}: {
  role: Role;
  name: string;
  children: React.ReactNode;
}) {
  const items = NAV_ITEMS.filter((i) => i.role === role);

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b-2 border-red-600 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.webp"
              alt="Đại học Y Hà Nội - Phân hiệu Thanh Hóa"
              width={44}
              height={44}
              className="h-11 w-11 flex-shrink-0 animate-logo-glow logo-spin-hover"
            />
            <div>
              <p className="font-semibold text-slate-800 text-sm">Căng tin Phân hiệu ĐHYHN Thanh Hóa</p>
              <nav className="flex gap-1 mt-1 -ml-2">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-md px-2 py-0.5 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-700">{name}</p>
            <p className="text-xs text-slate-400 mb-1">{ROLE_LABEL[role]}</p>
            <div className="flex items-center gap-3 justify-end">
              <Link href="/change-password" className="text-sm text-slate-500 hover:text-red-600 transition-colors">
                Đổi mật khẩu
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 animate-rise-in">
        {children}
      </main>
    </div>
  );
}
