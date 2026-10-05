// Imports officer ("cán bộ") accounts from OFFICERS_DATA_B64 (gzip + base64 JSON: [{ code, name, phone }]).
// Only missing accounts are created; existing accounts, passwords and data are never touched. The import
// runs once per distinct payload (an activity-log entry records the payload's hash), so deleting an
// officer later does not bring them back on the next restart. OFFICERS_DRY_RUN=1 only prints the plan.
//
// It must never stop the server from starting: every failure is caught and logged, exit code is 0.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { planOfficers } from "./import-officers-plan.mjs";

const b64 = process.env.OFFICERS_DATA_B64;
if (!b64) {
  console.log("import-officers: OFFICERS_DATA_B64 not set, skipping");
  process.exit(0);
}

const ACTION = "IMPORT_OFFICERS";
const DEFAULT_PASSWORD = "123";
const hash = createHash("sha256").update(b64.trim()).digest("hex").slice(0, 12);
const prisma = new PrismaClient();

try {
  const officers = JSON.parse(gunzipSync(Buffer.from(b64.trim(), "base64")).toString("utf8"));
  const done = await prisma.activityLog.findFirst({ where: { action: ACTION, detail: { contains: hash } } });
  if (done) {
    console.log("import-officers: this list was already imported, skipping");
  } else {
    const existing = await prisma.user.findMany({ select: { phone: true, staffCode: true, role: true } });
    const { create, alreadyThere, skipped } = planOfficers(officers, existing);
    console.log(`import-officers: list ${hash} — create ${create.length}, already there ${alreadyThere.length}, skipped ${skipped.length}`);
    for (const s of skipped) console.log("import-officers: skipped", s.name, "-", s.reason);

    if (process.env.OFFICERS_DRY_RUN) {
      console.log("import-officers: dry run, database untouched");
    } else {
      const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
      const skippedText = skipped.length ? `; bỏ qua ${skipped.length}: ${skipped.map((s) => `${s.name} (${s.reason})`).join("; ")}` : "";
      const detail = `Nhập danh sách cán bộ [${hash}]: tạo ${create.length} tài khoản, đã có sẵn ${alreadyThere.length}${skippedText}`;
      await prisma.$transaction([
        prisma.user.createMany({
          data: create.map((c) => ({
            name: c.name,
            phone: c.phone,
            staffCode: c.staffCode,
            passwordHash,
            role: "OFFICER",
            mustChangePassword: true,
          })),
        }),
        prisma.activityLog.create({ data: { userId: null, action: ACTION, detail } }),
      ]);
      console.log("import-officers: done —", detail);
    }
  }
} catch (err) {
  console.error("import-officers: failed, nothing changed:", err);
} finally {
  await prisma.$disconnect();
}
