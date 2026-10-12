// One-off: undoes what the automatic meal audit did while it was switched on (it has been removed).
//  - Make-up meals it added ("... (hệ thống tự bù)") that have not been eaten are taken out again: marked as
//    removed, not deleted, so an admin can still put one back with "Khôi phục" if it was right.
//  - Surplus meals it took off the end of a schedule ("Giảm gói tự động ...") are put back as they were.
// Meals that were already eaten are left alone and only counted in the log. Runs once (activity-log marker) and
// must never stop the server from starting: every failure is caught and logged, exit code is 0.
import { PrismaClient } from "@prisma/client";

const ACTION = "UNDO_AUTO_AUDIT";
const prisma = new PrismaClient();

try {
  const done = await prisma.activityLog.findFirst({ where: { action: ACTION } });
  if (done) {
    console.log("undo-auto-audit: already handled, skipping");
  } else {
    const made = await prisma.mealSession.findMany({
      where: { note: { contains: "(hệ thống tự bù)" } },
      select: { id: true, status: true, pickedUp: true },
    });
    const removable = made.filter((m) => m.status === "SCHEDULED" && !m.pickedUp);
    const kept = made.length - removable.length;

    const trimmed = await prisma.mealSession.findMany({
      where: { status: "CANCELLED", note: { startsWith: "Giảm gói tự động" } },
      select: { id: true, studentId: true, date: true, mealType: true },
    });
    let restored = 0;
    for (const t of trimmed) {
      const clash = await prisma.mealSession.findFirst({
        where: { studentId: t.studentId, date: t.date, mealType: t.mealType, status: { not: "CANCELLED" }, id: { not: t.id } },
        select: { id: true },
      });
      if (clash) continue;
      await prisma.mealSession.update({ where: { id: t.id }, data: { status: "SCHEDULED", cancelledAt: null, note: null } });
      restored += 1;
    }

    if (removable.length > 0) {
      await prisma.mealSession.updateMany({
        where: { id: { in: removable.map((m) => m.id) } },
        data: { status: "CANCELLED", cancelledAt: new Date(), note: "Xóa thủ công - hoàn tác bù tự động của hệ thống" },
      });
    }

    const detail =
      `Hoàn tác truy soát tự động: gỡ ${removable.length} buổi bù tự động chưa ăn, khôi phục ${restored} buổi đã bị bớt` +
      (kept > 0 ? `, giữ nguyên ${kept} buổi bù tự động đã ăn` : "");
    await prisma.activityLog.create({ data: { userId: null, action: ACTION, detail } });
    console.log("undo-auto-audit:", detail);
  }
} catch (err) {
  console.error("undo-auto-audit: failed, nothing changed:", err);
} finally {
  await prisma.$disconnect();
}
