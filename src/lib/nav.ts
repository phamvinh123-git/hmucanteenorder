import { hasRole, isTopRole, type Roles } from "@/lib/auth";

export type NavItem = { href: string; label: string };

const STAFF_CANTEEN: NavItem[] = [
  { href: "/sales", label: "Bán hàng" },
  { href: "/schedule", label: "Lịch tuần" },
  { href: "/manager/stats", label: "Thống kê" },
  { href: "/report", label: "Báo cáo" },
];

/**
 * The pages of the canteen service for a set of roles (empty: none of the roles uses the canteen). Staff pages come
 * first, then the lunch / meal ordering pages of officers and students.
 */
export function canteenNav(roles: Roles): NavItem[] {
  const items: NavItem[] = [];
  if (hasRole(roles, "MANAGER")) items.push({ href: "/manager", label: "Bán hàng" }, ...STAFF_CANTEEN.slice(1));
  else if (isTopRole(roles)) items.push(...STAFF_CANTEEN);
  else if (hasRole(roles, "SALES")) {
    items.push({ href: "/sales", label: "Bán hàng" }, { href: "/schedule", label: "Lịch tuần" }, { href: "/report", label: "Báo cáo" });
  }
  if (hasRole(roles, "OFFICER")) items.push({ href: "/officer", label: "Đặt cơm trưa" });
  if (hasRole(roles, "STUDENT")) items.push({ href: "/student", label: "Đặt suất ăn" });
  return items;
}

/** The pages for running the website itself: accounts (admin only), archives and the activity log. */
export function adminNav(roles: Roles): NavItem[] {
  if (hasRole(roles, "ADMIN")) {
    return [
      { href: "/admin", label: "Tài khoản" },
      { href: "/admin/archives", label: "Lưu trữ" },
      { href: "/admin/logs", label: "Nhật ký" },
    ];
  }
  if (hasRole(roles, "SERVICE_HEAD")) {
    return [
      { href: "/admin/archives", label: "Lưu trữ" },
      { href: "/admin/logs", label: "Nhật ký" },
    ];
  }
  return [];
}
