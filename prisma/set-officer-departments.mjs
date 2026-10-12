// Fills in the department ("phòng ban") of officer accounts from the staff list, and switches on automatic
// weekly lunch registration for the officers of Phòng TCHCQT (Tổ chức hành chính và Quản trị) — except the
// accounts listed in AUTO_EXCLUDED.
//
// It runs at every start but only touches officers whose department is still empty, so a department an
// admin has set or changed by hand is never overwritten, and neither is an admin's later choice to switch
// automatic registration off. Officers imported later are picked up at the next start. It must never stop
// the server from starting: every failure is caught and logged, exit code is 0.
import { PrismaClient } from "@prisma/client";
import { DEPARTMENT_BY_CODE, DEPARTMENT_BY_NAME } from "./officer-departments-data.mjs";

const AUTO_DEPARTMENT = "Phòng TCHCQT";
// Bùi Lương Vũ Ngọc is in the department but is not registered automatically.
const AUTO_EXCLUDED_CODES = ["02830"];
const AUTO_EXCLUDED_NAMES = ["bui luong vu ngoc"];

const fold = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const prisma = new PrismaClient();

try {
  const officers = await prisma.user.findMany({
    where: { isOfficer: true, department: null },
    select: { id: true, name: true, staffCode: true },
  });

  let departments = 0;
  let autoOn = 0;
  for (const o of officers) {
    const code = o.staffCode?.toUpperCase() ?? null;
    const folded = fold(o.name);
    const department = (code && DEPARTMENT_BY_CODE[code]) || DEPARTMENT_BY_NAME[folded];
    if (!department) continue;

    const excluded = (code && AUTO_EXCLUDED_CODES.includes(code)) || AUTO_EXCLUDED_NAMES.includes(folded);
    const auto = department === AUTO_DEPARTMENT && !excluded;
    await prisma.user.update({ where: { id: o.id }, data: { department, ...(auto ? { autoRegister: true } : {}) } });
    departments += 1;
    if (auto) autoOn += 1;
  }

  if (departments > 0) {
    const detail = `Nhập phòng ban cho ${departments} cán bộ; bật tự động đăng ký cơm trưa cho ${autoOn} cán bộ ${AUTO_DEPARTMENT} (trừ Bùi Lương Vũ Ngọc)`;
    await prisma.activityLog.create({ data: { userId: null, action: "SET_OFFICER_DEPARTMENTS", detail } });
    console.log("set-officer-departments:", detail);
  } else {
    console.log("set-officer-departments: nothing to do");
  }
} catch (err) {
  console.error("set-officer-departments: failed, nothing changed:", err);
} finally {
  await prisma.$disconnect();
}
