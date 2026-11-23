// Adds the standard courts of "Đặt sân" (football, basketball, badminton, table tennis) and their time slots.
//
//   node prisma/seed-courts.mjs            show what would be added (changes nothing)
//   node prisma/seed-courts.mjs --apply    really add it
//
// Safe to run twice: a court that already exists (same name) is kept (its kind and lending days are brought up to date)
// and only slots it lacks are added.
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");

const SLOTS = [
  ["17:00", "18:00"],
  ["18:00", "19:00"],
  ["19:00", "20:00"],
];
// The indoor basketball court is not lent out yet: it is added switched off (turn it on in "Quản lý sân").
// Pickleball is booked freely for now, so it is not here. The football pitch has its own manager: choose that person
// in "Quản lý sân" once their account (role Quản lý đặt sân) exists, and its bookings then go union -> manager.
const COURTS = [
  { name: "Sân bóng đá", description: "Bóng đá", kind: "FOOTBALL" },
  { name: "Sân bóng rổ ngoài trời", description: "Bóng rổ", kind: "BASKETBALL" },
  { name: "Sân bóng rổ trong nhà", description: "Bóng rổ, chưa cho mượn", kind: "BASKETBALL", active: false },
  // Badminton and table tennis are lent out on Tuesday, Thursday and Saturday ("lịch 3-5-7").
  { name: "Sân cầu lông 1", description: "Cầu lông", kind: "BADMINTON", openDays: [2, 4, 6] },
  { name: "Sân cầu lông 2", description: "Cầu lông", kind: "BADMINTON", openDays: [2, 4, 6] },
  { name: "Sân bóng bàn 1", description: "Bóng bàn", kind: "TABLE_TENNIS", openDays: [2, 4, 6] },
  { name: "Sân bóng bàn 2", description: "Bóng bàn", kind: "TABLE_TENNIS", openDays: [2, 4, 6] },
  { name: "Sân bóng bàn 3", description: "Bóng bàn", kind: "TABLE_TENNIS", openDays: [2, 4, 6] },
];

const prisma = new PrismaClient();
try {
  console.log(apply ? "Adding courts:" : "Dry run (nothing written; add --apply):");
  let order = await prisma.court.count();
  for (const c of COURTS) {
    const existing = await prisma.court.findUnique({ where: { name: c.name }, include: { slots: true } });
    const have = new Set(existing?.slots.map((s) => s.startTime) ?? []);
    const missing = SLOTS.filter(([start]) => !have.has(start));
    console.log(`${existing ? "=" : "+"} ${c.name}${c.active === false && !existing ? " (tắt)" : ""}: ${missing.length ? "ca " + missing.map(([a, b]) => `${a}-${b}`).join(", ") : "đủ ca"}`);
    // A court made by an earlier run gets its kind and lending days now.
    if (apply && existing && (existing.kind !== c.kind || (c.openDays && existing.openDays.join() !== c.openDays.join()))) {
      await prisma.court.update({ where: { id: existing.id }, data: { kind: c.kind, ...(c.openDays ? { openDays: c.openDays } : {}) } });
      console.log(`  (đã cập nhật loại sân và ngày cho thuê của ${c.name})`);
    }
    if (!apply || (existing && missing.length === 0)) continue;
    const slots = missing.map(([startTime, endTime]) => ({ startTime, endTime }));
    if (existing) {
      await prisma.courtSlot.createMany({ data: slots.map((s) => ({ ...s, courtId: existing.id })) });
    } else {
      await prisma.court.create({ data: { name: c.name, description: c.description, kind: c.kind, ...(c.openDays ? { openDays: c.openDays } : {}), active: c.active !== false, sortOrder: order++, slots: { create: slots } } });
    }
  }
  if (apply) {
    await prisma.activityLog.create({ data: { userId: null, action: "COURT_MANAGE", detail: "Thêm các sân chuẩn (bóng đá, bóng rổ, cầu lông, bóng bàn) và ca giờ" } });
    console.log("Done.");
  }
} finally {
  await prisma.$disconnect();
}
