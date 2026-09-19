// Runs on every start, after `prisma migrate deploy`. Only acts on an empty
// database: imports a data snapshot from SEED_DATA_B64 (gzip+base64 JSON) if
// provided, otherwise creates the default admin account.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { gunzipSync } from "node:zlib";

const prisma = new PrismaClient();

const DATE_FIELDS = {
  users: ["createdAt"],
  registrations: ["startDate", "createdAt"],
  sessions: ["date", "pickedUpAt", "cancelledAt", "createdAt"],
  logs: ["createdAt"],
};

function revive(rows, fields) {
  return rows.map((r) => {
    const copy = { ...r };
    for (const f of fields) if (copy[f]) copy[f] = new Date(copy[f]);
    return copy;
  });
}

async function main() {
  if ((await prisma.user.count()) > 0) {
    console.log("bootstrap: database already has data, skipping");
    return;
  }

  const b64 = process.env.SEED_DATA_B64;
  if (b64) {
    const data = JSON.parse(gunzipSync(Buffer.from(b64, "base64")).toString("utf8"));
    await prisma.user.createMany({ data: revive(data.users, DATE_FIELDS.users) });
    await prisma.mealRegistration.createMany({ data: revive(data.registrations, DATE_FIELDS.registrations) });

    const sessions = revive(data.sessions, DATE_FIELDS.sessions);
    // compensationForId is a self-reference: insert without it, then link.
    await prisma.mealSession.createMany({ data: sessions.map((s) => ({ ...s, compensationForId: null })) });
    for (const s of sessions.filter((x) => x.compensationForId)) {
      await prisma.mealSession.update({ where: { id: s.id }, data: { compensationForId: s.compensationForId } });
    }

    await prisma.activityLog.createMany({ data: revive(data.logs, DATE_FIELDS.logs) });
    console.log(
      `bootstrap: imported ${data.users.length} users, ${data.registrations.length} registrations, ${data.sessions.length} sessions, ${data.logs.length} logs`,
    );
    return;
  }

  await prisma.user.create({
    data: {
      phone: "0900000000",
      name: "Quản trị viên",
      passwordHash: await bcrypt.hash("admin123", 10),
      role: "ADMIN",
      mustChangePassword: true,
    },
  });
  console.log("bootstrap: created default admin 0900000000 / admin123 (must change on first login)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
