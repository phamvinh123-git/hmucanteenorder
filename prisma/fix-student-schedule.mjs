// One-off data correction for student 0914865263 (STT 110, Hoàng Đại Lộc) — see
// fix-student-schedule-plan.mjs for the rules. Runs on every start but is guarded by an
// activity-log marker, so it only ever changes data once. FIX_DRY_RUN=1 only prints the plan.
//
// It must never stop the server from starting: every failure is caught and logged, exit code is 0.
import { PrismaClient } from "@prisma/client";
import { PHONE, planFix } from "./fix-student-schedule-plan.mjs";

const ACTION = "FIX_STUDENT_SCHEDULE";
const prisma = new PrismaClient();

try {
  const done = await prisma.activityLog.findFirst({ where: { action: ACTION, detail: { contains: PHONE } } });
  if (done) {
    console.log("fix-student-schedule: already applied, skipping");
  } else {
    const student = await prisma.user.findUnique({ where: { phone: PHONE } });
    if (!student || student.role !== "STUDENT") {
      console.log("fix-student-schedule: student not found, nothing to do");
    } else {
      const sessions = await prisma.mealSession.findMany({
        where: { studentId: student.id },
        select: { id: true, registrationId: true, studentId: true, date: true, mealType: true, status: true, price: true },
      });
      const { remove, create, notes } = planFix(sessions);
      console.log(`fix-student-schedule: ${student.name} — delete ${remove.length}, create ${create.length}`);
      for (const n of notes) console.log("fix-student-schedule:", n);

      if (process.env.FIX_DRY_RUN) {
        console.log("fix-student-schedule: dry run, database untouched");
      } else {
        const detail = `Sửa lịch ăn của ${student.name} (${PHONE}): bỏ ${remove.length} buổi chủ nhật ghi nhầm, thêm ${create.length} buổi thứ 6 (tổng số buổi giữ nguyên)`;
        await prisma.$transaction([
          // A make-up slot may point at a Sunday session; detach it before that session goes.
          prisma.mealSession.updateMany({ where: { compensationForId: { in: remove } }, data: { compensationForId: null } }),
          prisma.mealSession.deleteMany({ where: { id: { in: remove } } }),
          prisma.mealSession.createMany({ data: create }),
          prisma.activityLog.create({ data: { userId: null, action: ACTION, detail } }),
        ]);
        console.log("fix-student-schedule: applied —", detail);
      }
    }
  }
} catch (err) {
  console.error("fix-student-schedule: failed, data left unchanged:", err);
} finally {
  await prisma.$disconnect();
}
