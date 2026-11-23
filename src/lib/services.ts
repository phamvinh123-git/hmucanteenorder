import { canAccessCostly, hasRole, isTopRole, type Roles } from "@/lib/auth";
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
export function servicesFor(roles: Roles): Service[] {
  const services: Service[] = [];
  const canteen = canteenNav(roles);
  if (canteen.length > 0) {
    services.push({
      key: "canteen",
      title: "Căng tin",
      description: hasRole(roles, "STUDENT", "OFFICER") && !hasRole(roles, "SALES", "MANAGER") && !isTopRole(roles) ? "Đặt suất ăn, hủy và xem lịch ăn." : "Bán hàng, lịch ăn, báo cáo và thống kê.",
      icon: "🍱",
      href: canteen[0].href,
      paths: ["/student", "/officer", "/sales", "/schedule", "/report", "/manager"],
      items: canteen,
    });
  }
  if (canUseCourts(roles)) {
    services.push({
      key: "courts",
      title: "Đặt sân",
      description: hasRole(roles, "UNION", "COURT_MANAGER") || isTopRole(roles) ? "Đặt sân, duyệt lượt đặt và quản lý sân, các ca." : "Đặt lịch sân theo ca, xem sân còn trống.",
      icon: "🏸",
      href: "/courts",
      paths: ["/courts"],
      items: [],
    });
  }
  if (canAccessCostly(roles)) {
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
  const admin = adminNav(roles);
  if (admin.length > 0) {
    services.push({
      key: "admin",
      title: "Quản trị",
      description: hasRole(roles, "ADMIN") ? "Tài khoản và phân quyền, lưu trữ, nhật ký hoạt động." : "Lưu trữ và nhật ký hoạt động.",
      icon: "⚙️",
      href: admin[0].href,
      paths: ["/admin"],
      items: admin,
    });
  }
  return services;
}

/** Where an account lands: its first service ("/" when it has none, which then explains that). */
export function homeFor(roles: Roles) {
  return servicesFor(roles)[0]?.href ?? "/";
}

type SoonService = { key: string; title: string; description: string; icon: string };

/** Services planned for later, shown on the home page as "coming soon" to the roles they are meant for. */
export function comingSoonFor(roles: Roles): SoonService[] {
  const all = isTopRole(roles);
  const soon: SoonService[] = [];
  if (all || hasRole(roles, "OFFICER")) {
    soon.push({ key: "transport", title: "Đặt xe & phòng ăn, nghỉ", description: "Đặt xe, phòng ăn và phòng nghỉ cho thầy cô.", icon: "🚗" });
  }
  if (all || hasRole(roles, "STUDENT")) {
    soon.push({ key: "dorm", title: "Ký túc xá", description: "Đăng ký và quản lý phòng ký túc xá.", icon: "🛏️" });
  }
  return soon;
}
