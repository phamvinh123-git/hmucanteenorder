// One-off clean-up: removes the test officer account named "canbo" (with its test meals), once.
// Guarded by an activity-log marker, and it only acts when exactly one account has that name, that account
// is an officer, and it never registered meals for anyone else. It must never stop the server from starting:
// every failure is caught and logged, exit code is 0.
import { PrismaClient } from "@prisma/client";

const ACTION = "DELETE_TEST_OFFICER";
const NAME = "canbo";
const prisma = new PrismaClient();

try {
  const done = await prisma.activityLog.findFirst({ where: { action: ACTION } });
  if (done) {
    console.log("delete-test-officer: already handled, skipping");
  } else {
    const matches = await prisma.user.findMany({ where: { name: { equals: NAME, mode: "insensitive" } } });
    if (matches.length > 1) {
      console.log(`delete-test-officer: ${matches.length} accounts are named "${NAME}", not touching any`);
    } else {
      let detail = `Không có tài khoản cán bộ thử "${NAME}" để xóa`;
      const user = matches[0];
      if (user) {
        const forOthers = await prisma.mealRegistration.count({ where: { createdById: user.id, studentId: { not: user.id } } });
        if (!(user.isOfficer || user.role === "OFFICER") || forOthers > 0) {
          console.log("delete-test-officer: account is not a plain test officer, leaving it");
          detail = "";
        } else {
          const meals = await prisma.mealSession.count({ where: { studentId: user.id } });
          detail = `Xóa tài khoản cán bộ thử "${user.name}" (${user.staffCode ?? user.phone}) cùng ${meals} suất cơm thử`;
          await prisma.$transaction([
            prisma.mealSession.updateMany({ where: { studentId: user.id }, data: { compensationForId: null } }),
            prisma.mealSession.deleteMany({ where: { studentId: user.id } }),
            prisma.mealRegistration.deleteMany({ where: { studentId: user.id } }),
            prisma.activityLog.updateMany({ where: { userId: user.id }, data: { userId: null } }),
            prisma.user.delete({ where: { id: user.id } }),
          ]);
        }
      }
      if (detail) {
        await prisma.activityLog.create({ data: { userId: null, action: ACTION, detail } });
        console.log("delete-test-officer:", detail);
      }
    }
  }
} catch (err) {
  console.error("delete-test-officer: failed, nothing changed:", err);
} finally {
  await prisma.$disconnect();
}
