import { Role } from "@prisma/client";

export type NavItem = { href: string; label: string };

const STAFF_CANTEEN: NavItem[] = [
  { href: "/sales", label: "Bán hàng" },
  { href: "/schedule", label: "Lịch tuần" },
  { href: "/manager/stats", label: "Thống kê" },
  { href: "/report", label: "Báo cáo" },
];

/** The pages of the canteen service for a role (empty: the role does not use the canteen). */
export function canteenNav(role: Role): NavItem[] {
  switch (role) {
    case "STUDENT":
      return [{ href: "/student", label: "Đặt suất ăn" }];
    case "OFFICER":
      return [{ href: "/officer", label: "Đặt cơm trưa" }];
    case "SALES":
      return [
        { href: "/sales", label: "Bán hàng" },
        { href: "/schedule", label: "Lịch tuần" },
        { href: "/report", label: "Báo cáo" },
      ];
    case "MANAGER":
      return [{ href: "/manager", label: "Bán hàng" }, ...STAFF_CANTEEN.slice(1)];
    case "ADMIN":
    case "SERVICE_HEAD":
      return STAFF_CANTEEN;
    default:
      return [];
  }
}

/** The pages for running the website itself: accounts (admin only), archives and the activity log. */
export function adminNav(role: Role): NavItem[] {
  if (role === "ADMIN") {
    return [
      { href: "/admin", label: "Tài khoản" },
      { href: "/admin/archives", label: "Lưu trữ" },
      { href: "/admin/logs", label: "Nhật ký" },
    ];
  }
  if (role === "SERVICE_HEAD") {
    return [
      { href: "/admin/archives", label: "Lưu trữ" },
      { href: "/admin/logs", label: "Nhật ký" },
    ];
  }
  return [];
}
