import type { Role } from "@prisma/client";

// Roles in plain data, safe to import from client components. The rules for what each role may do live in
// src/lib/auth.ts (helpers) and src/lib/services.ts (which services open for which roles).

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Quản trị viên",
  SERVICE_HEAD: "Tổ trưởng tổ dịch vụ",
  MANAGER: "Quản lý căng tin",
  COURT_MANAGER: "Quản lý đặt sân",
  SALES: "Bán hàng",
  CANTEEN_SUPPORT: "Hỗ trợ căng tin",
  UNION: "Liên chi đoàn",
  CLUB_CAPTAIN: "Đội trưởng CLB",
  OFFICER: "Cán bộ",
  STUDENT: "Sinh viên",
};

/**
 * The roles an admin can tick for an account, from the top down. A person may hold several at once (one person
 * often does several jobs); the screens they see are the ones their roles open together. A student account is
 * always a student; it can take extra roles like the student union but never "Cán bộ".
 */
export const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "SERVICE_HEAD", "MANAGER", "COURT_MANAGER", "SALES", "CANTEEN_SUPPORT", "UNION", "CLUB_CAPTAIN", "OFFICER"];

/** What each assignable role is for, shown next to its tick box. */
export const ROLE_HINT: Partial<Record<Role, string>> = {
  ADMIN: "Mọi thứ, kể cả cấp tài khoản",
  SERVICE_HEAD: "Mọi dịch vụ, trừ cấp tài khoản",
  MANAGER: "Quản lý căng tin",
  COURT_MANAGER: "Quản lý sân được giao (VD sân bóng đá)",
  SALES: "Bán hàng ở căng tin",
  CANTEEN_SUPPORT: "Nhập giá vốn",
  UNION: "Duyệt đặt sân và đơn của đội trưởng",
  CLUB_CAPTAIN: "Nộp đơn thuê sân cầu lông, bóng bàn, bóng rổ",
  OFFICER: "Cán bộ: căng tin, đặt xe và phòng",
};

/** Which role is the account's main one when several are ticked (it keeps student data, labels...). */
export const ROLE_PRIORITY: Role[] = ["STUDENT", ...ASSIGNABLE_ROLES];
