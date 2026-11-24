import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/log";
import type { CourtKind } from "@/lib/court-kinds";

// Courts made before they had a kind (or by a seed that was not run again) are all "OTHER", which draws a plain green
// field and lets them be booked every day. This works the kind out from the court's name once, and gives badminton and
// table tennis their lending days (Tuesday, Thursday, Saturday: "lịch 3-5-7"). A court that already has a kind, or that an
// admin changed afterwards, is never touched again.

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();

function kindFromName(name: string): CourtKind | null {
  const n = fold(name);
  if (n.includes("cau long")) return "BADMINTON";
  if (n.includes("bong ban")) return "TABLE_TENNIS";
  if (n.includes("bong da")) return "FOOTBALL";
  if (n.includes("bong ro")) return "BASKETBALL";
  if (n.includes("pickle")) return "PICKLEBALL";
  return null;
}

let nextTry = 0;

export async function syncCourtKinds() {
  if (Date.now() < nextTry) return;
  nextTry = Date.now() + 60_000;
  try {
    const done = await prisma.activityLog.findFirst({ where: { action: "COURTS_AUTO_KIND" } });
    if (done) {
      nextTry = Infinity;
      return;
    }
    const courts = await prisma.court.findMany({ where: { kind: "OTHER" } });
    let changed = 0;
    for (const c of courts) {
      const kind = kindFromName(c.name);
      if (!kind) continue;
      const lent357 = (kind === "BADMINTON" || kind === "TABLE_TENNIS") && c.openDays.length >= 7;
      await prisma.court.update({ where: { id: c.id }, data: { kind, ...(lent357 ? { openDays: [2, 4, 6] } : {}) } });
      changed++;
    }
    if (changed > 0) {
      await logActivity(null, "COURTS_AUTO_KIND", `Tự nhận loại sân theo tên cho ${changed} sân (cầu lông, bóng bàn cho thuê Thứ 3, 5, 7)`);
      nextTry = Infinity;
    }
  } catch (err) {
    console.error("Court kinds setup failed", err);
  }
}
