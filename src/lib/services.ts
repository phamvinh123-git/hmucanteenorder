import { Role } from "@prisma/client";
import { canAccessCostly } from "@/lib/auth";
import { canUseCourts } from "@/lib/courts";
import { adminNav, canteenNav, NavItem } from "@/lib/nav";

export type Service = {
  key: string;
  title: string;
  description: string;
  icon: string;
  /** Where the service opens. */
  href: string;
  /** Path prefixes that belong to the service (the menu follows the page you are on). */
  paths: string[];
  /** The pages inside the service, shown as tabs in the header. */
  items: NavItem[];
};

/**
 * The services of the website this account may open, shown as tiles on the home page and in the header menu. A new
 * service (rooms, dormitory...) is one more entry here, with its own pages under its own path.
 */
export function servicesFor(role: Role): Service[] {
  const services: Service[] = [];
  const canteen = canteenNav(role);
  if (canteen.length > 0) {
    services.push({
      key: "canteen",
      title: "Căng tin",
      description: role === "STUDENT" || role === "OFFICER" ? "Đặt suất ăn, hủy và xem lịch ăn." : "Bán hàng, lịch ăn, báo cáo và thống kê.",
      icon: "🍱",
      href: canteen[0].href,
      paths: ["/student", "/officer", "/sales", "/schedule", "/report", "/manager"],
      items: canteen,
    });
  }
  if (canUseCourts(role)) {
    services.push({
      key: "courts",
      title: "Đặt sân",
      description: role === "UNION" || role === "COURT_MANAGER" ? "Duyệt lượt đặt sân, quản lý sân và các ca." : "Đặt lịch sân theo ca, xem sân còn trống.",
      icon: "🏸",
      href: "/courts",
      paths: ["/courts"],
      items: [],
    });
  }
  if (canAccessCostly(role)) {
    services.push({
      key: "costly",
      title: "Giá vốn",
      description: "Sổ tính giá vốn nguyên liệu, cốt và công thức.",
      icon: "🧮",
      href: "/costly",
      paths: ["/costly"],
      items: [],
    });
  }
  const admin = adminNav(role);
  if (admin.length > 0) {
    services.push({
      key: "admin",
      title: "Quản trị",
      description: role === "ADMIN" ? "Tài khoản, lưu trữ và nhật ký hoạt động." : "Lưu trữ và nhật ký hoạt động.",
      icon: "⚙️",
      href: admin[0].href,
      paths: ["/admin"],
      items: admin,
    });
  }
  return services;
}

/** Services planned for later: shown on the home page as "coming soon" so everyone sees the whole picture. */
export const COMING_SOON: { key: string; title: string; description: string; icon: string }[] = [
  { key: "transport", title: "Đặt xe & phòng ăn, nghỉ", description: "Đặt xe, phòng ăn và phòng nghỉ cho thầy cô.", icon: "🚗" },
  { key: "dorm", title: "Ký túc xá", description: "Đăng ký và quản lý phòng ký túc xá.", icon: "🛏️" },
];
