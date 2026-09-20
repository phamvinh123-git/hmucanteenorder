// One-time roster import, driven by ROSTER_DATA_B64 (gzip+base64 JSON).
// Replaces ALL student data (students, registrations, sessions, activity
// logs) with the roster; staff accounts (non-STUDENT) are kept. Guarded by an
// IMPORT_ROSTER activity-log marker so a restart never re-runs it.
// IMPORT_DRY_RUN=1 only prints the counts, without touching the database.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { gunzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";

const b64 = process.env.ROSTER_DATA_B64;
if (!b64) {
  console.log("import-roster: ROSTER_DATA_B64 not set, skipping");
  process.exit(0);
}

const roster = JSON.parse(gunzipSync(Buffer.from(b64, "base64")).toString("utf8"));
const { snapshot, startDate, students } = roster;
const DEFAULT_PASSWORD = "123";

// Dates are stored as Vietnam-local midnight, matching how the app itself
// creates them (date-fns startOfDay in Asia/Ho_Chi_Minh).
const dayStart = (ymd) => new Date(`${ymd}T00:00:00+07:00`);
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

const users = [];
const registrations = [];
const sessions = [];
const stats = { students: 0, completed: 0, scheduled: 0, cancelled: 0 };

const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
const now = new Date();

const prisma = new PrismaClient();
const admin = process.env.IMPORT_DRY_RUN
  ? { id: "dry-run" }
  : await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
if (!admin) throw new Error("No ADMIN account found to own the registrations");

for (const s of students) {
  const userId = randomUUID();
  const regId = randomUUID();
  const slots = [];
  for (let i = 0; i < s.cells.length; i++) {
    const ch = s.cells[i];
    if (ch === ".") continue;
    const day = addDays(startDate, Math.floor(i / 2));
    slots.push({ ymd: day, mealType: i % 2 === 0 ? "LUNCH" : "DINNER", ch });
  }
  if (slots.length === 0) continue;

  const hasLunch = slots.some((x) => x.mealType === "LUNCH");
  const hasDinner = slots.some((x) => x.mealType === "DINNER");

  users.push({
    id: userId,
    phone: s.phone,
    name: s.name,
    passwordHash,
    role: "STUDENT",
    mustChangePassword: true,
    orderCode: s.stt,
    createdAt: now,
  });
  registrations.push({
    id: regId,
    studentId: userId,
    startDate: dayStart(slots[0].ymd),
    totalSessions: s.total > 0 ? s.total : slots.length,
    mealPattern: hasLunch && hasDinner ? "BOTH" : hasLunch ? "LUNCH" : "DINNER",
    pricePerMeal: s.price,
    createdById: admin.id,
    createdAt: now,
  });
  stats.students++;

  for (const slot of slots) {
    const date = dayStart(slot.ymd);
    const base = { id: randomUUID(), registrationId: regId, studentId: userId, date, mealType: slot.mealType, price: s.price };
    if (slot.ch === "0") {
      sessions.push({ ...base, status: "CANCELLED", cancelledAt: date });
      stats.cancelled++;
    } else if (slot.ymd <= snapshot) {
      sessions.push({ ...base, status: "COMPLETED", pickedUp: true, pickedUpAt: date });
      stats.completed++;
    } else {
      sessions.push({ ...base, status: "SCHEDULED" });
      stats.scheduled++;
    }
  }
}

console.log("import-roster: prepared", stats, "sessions:", sessions.length);

if (process.env.IMPORT_DRY_RUN) {
  console.log("import-roster: dry run, database untouched");
  process.exit(0);
}

try {
  const done = await prisma.activityLog.findFirst({ where: { action: "IMPORT_ROSTER" } });
  if (done) {
    console.log("import-roster: already imported, skipping");
  } else {
    const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
    await prisma.$transaction(
      [
        prisma.mealSession.updateMany({ data: { compensationForId: null } }),
        prisma.mealSession.deleteMany({}),
        prisma.mealRegistration.deleteMany({}),
        prisma.activityLog.deleteMany({}),
        prisma.user.deleteMany({ where: { role: "STUDENT" } }),
        prisma.user.createMany({ data: users }),
        prisma.mealRegistration.createMany({ data: registrations }),
        ...chunk(sessions, 1000).map((data) => prisma.mealSession.createMany({ data })),
        prisma.activityLog.create({
          data: {
            userId: admin.id,
            action: "IMPORT_ROSTER",
            detail: `Nhập dữ liệu từ file Excel: ${stats.students} sinh viên, ${stats.completed} buổi đã ăn, ${stats.scheduled} buổi sắp tới, ${stats.cancelled} buổi hủy`,
          },
        }),
      ],
      { timeout: 120000 },
    );
    console.log("import-roster: imported", stats);
  }
} finally {
  await prisma.$disconnect();
}
