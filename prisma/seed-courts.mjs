// Adds the standard courts of "Đặt sân" (football, basketball, badminton, table tennis) and their time slots.
//
//   node prisma/seed-courts.mjs            show what would be added (changes nothing)
//   node prisma/seed-courts.mjs --apply    really add it
//
// Safe to run twice: a court that already exists (same name) is kept, and only slots it lacks are added.
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
  { name: "Sân bóng đá", description: "Bóng đá" },
  { name: "Sân bóng rổ ngoài trời", description: "Bóng rổ" },
  { name: "Sân bóng rổ trong nhà", description: "Bóng rổ, chưa cho mượn", active: false },
  { name: "Sân cầu lông 1", description: "Cầu lông" },
  { name: "Sân cầu lông 2", description: "Cầu lông" },
  { name: "Sân bóng bàn 1", description: "Bóng bàn" },
  { name: "Sân bóng bàn 2", description: "Bóng bàn" },
  { name: "Sân bóng bàn 3", description: "Bóng bàn" },
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
    if (!apply || (existing && missing.length === 0)) continue;
    const slots = missing.map(([startTime, endTime]) => ({ startTime, endTime }));
    if (existing) {
      await prisma.courtSlot.createMany({ data: slots.map((s) => ({ ...s, courtId: existing.id })) });
    } else {
      await prisma.court.create({ data: { name: c.name, description: c.description, active: c.active !== false, sortOrder: order++, slots: { create: slots } } });
    }
  }
  if (apply) {
    await prisma.activityLog.create({ data: { userId: null, action: "COURT_MANAGE", detail: "Thêm các sân chuẩn (bóng đá, bóng rổ, cầu lông, bóng bàn) và ca giờ" } });
    console.log("Done.");
  }
} finally {
  await prisma.$disconnect();
}
