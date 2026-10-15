// One-off clean-up of what undo-auto-audit.mjs left behind: the make-up meals the removed automatic audit had
// added are still in the schedule as "Đã xóa — hoàn tác bù tự động của hệ thống" rows. They are deleted now.
//
// Each such row was the make-up of a cancelled meal. To keep every package adding up, that cancelled meal is
// marked as one staff took out on purpose ("Xóa thủ công - hủy không bù"): it is not owed a make-up. A row with
// no cancelled meal behind it is left alone (deleting it would make its package look short), and counted in the log.
// Only data from the Excel import is touched: registrations created at or before the import (the IMPORT_ROSTER
// log entry; without one, before 21/09/2026). Students who registered new in the app after that are left exactly as they are.
// Runs once (activity-log marker) and must never stop the server from starting: failures are caught and logged,
// exit code is 0.
import { PrismaClient } from "@prisma/client";

const ACTION = "PURGE_AUTO_AUDIT_LEFTOVERS";
const LEFTOVER = "Xóa thủ công - hoàn tác bù tự động";
const KEPT_NOTES = ["Xóa thủ công", "Giảm gói", "Tự động bớt buổi cuối"];
const prisma = new PrismaClient();

try {
  const done = await prisma.activityLog.findFirst({ where: { action: ACTION } });
  if (done) {
    console.log("purge-auto-audit-leftovers: already handled, skipping");
  } else {
    const importLog = await prisma.activityLog.findFirst({ where: { action: "IMPORT_ROSTER" }, orderBy: { createdAt: "asc" } });
    const importedUntil = importLog?.createdAt ?? new Date("2026-09-21T00:00:00+07:00");

    const found = await prisma.mealSession.findMany({
      where: { status: "CANCELLED", note: { startsWith: LEFTOVER }, registration: { createdAt: { lte: importedUntil } } },
      select: { id: true, compensationForId: true },
    });
    const leftovers = found;
    const linked = leftovers.filter((l) => l.compensationForId);
    const unlinked = leftovers.length - linked.length;

    const originals = linked.length
      ? await prisma.mealSession.findMany({
          where: { id: { in: linked.map((l) => l.compensationForId) } },
          select: { id: true, status: true, note: true },
        })
      : [];
    // Only a still-cancelled meal that is not already marked as taken out on purpose needs the new note.
    const toMark = originals
      .filter((o) => o.status === "CANCELLED" && !KEPT_NOTES.some((n) => o.note?.startsWith(n)))
      .map((o) => o.id);

    await prisma.$transaction([
      ...(toMark.length > 0
        ? [
            prisma.mealSession.updateMany({
              where: { id: { in: toMark } },
              data: { note: "Xóa thủ công - hủy không bù" },
            }),
          ]
        : []),
      prisma.mealSession.deleteMany({ where: { id: { in: linked.map((l) => l.id) } } }),
    ]);

    const detail =
      `Dọn các buổi bù tự động đã hoàn tác: xóa ${linked.length} buổi` +
      (unlinked > 0 ? `, giữ nguyên ${unlinked} buổi không gắn với buổi hủy nào` : "") +
      " (chỉ dữ liệu nhập từ Excel; sinh viên đăng ký mới trong hệ thống được giữ nguyên)";
    await prisma.activityLog.create({ data: { userId: null, action: ACTION, detail } });
    console.log("purge-auto-audit-leftovers:", detail);
  }
} catch (err) {
  console.error("purge-auto-audit-leftovers: failed, nothing changed:", err);
} finally {
  await prisma.$disconnect();
}
