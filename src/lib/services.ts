import { Role } from "@prisma/client";
import { canAccessCostly, homePathForRole } from "@/lib/auth";
import { canUseCourts } from "@/lib/courts";

export type Service = { key: string; title: string; description: string; icon: string; href: string };

/**
 * The services of the website this account may open, shown as cards on the home page. A new service (rooms,
 * dormitory...) is one more entry here, with its own pages under its own path.
 */
export function servicesFor(role: Role): Service[] {
  const services: Service[] = [];
  if (role !== "CANTEEN_SUPPORT" && role !== "UNION") {
    services.push({
      key: "canteen",
      title: "Căng tin",
      description: role === "STUDENT" || role === "OFFICER" ? "Đặt suất ăn, hủy và xem lịch ăn." : "Bán hàng, lịch ăn, báo cáo và thống kê.",
      icon: "🍱",
      href: homePathForRole(role),
    });
  }
  if (canUseCourts(role)) {
    services.push({
      key: "courts",
      title: "Đặt sân",
      description: role === "UNION" ? "Duyệt lượt đặt sân của sinh viên." : "Đặt lịch sân theo ca, xem sân còn trống.",
      icon: "🏸",
      href: "/courts",
    });
  }
  if (canAccessCostly(role)) {
    services.push({
      key: "costly",
      title: "Giá vốn",
      description: "Sổ tính giá vốn nguyên liệu, cốt và công thức.",
      icon: "🧮",
      href: "/costly",
    });
  }
  return services;
}
