// Adds the standard courts of "Đặt sân" and their time slots.
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
const COURTS = [
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
    console.log(`${existing ? "=" : "+"} ${c.name}: ${missing.length ? "ca " + missing.map(([a, b]) => `${a}-${b}`).join(", ") : "đủ ca"}`);
    if (!apply || (existing && missing.length === 0)) continue;
    const slots = missing.map(([startTime, endTime]) => ({ startTime, endTime }));
    if (existing) {
      await prisma.courtSlot.createMany({ data: slots.map((s) => ({ ...s, courtId: existing.id })) });
    } else {
      await prisma.court.create({ data: { name: c.name, description: c.description, sortOrder: order++, slots: { create: slots } } });
    }
  }
  if (apply) {
    await prisma.activityLog.create({ data: { userId: null, action: "COURT_MANAGE", detail: "Thêm các sân cầu lông, bóng bàn chuẩn và ca giờ" } });
    console.log("Done.");
  }
} finally {
  await prisma.$disconnect();
}
