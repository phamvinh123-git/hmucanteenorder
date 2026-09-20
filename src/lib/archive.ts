import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Actor = { id: string; name: string };
type Row = Record<string, unknown>;
type Snapshot = { users: Row[]; registrations: Row[]; sessions: Row[] };
type Tx = Prisma.TransactionClient;

const DATE_FIELDS = {
  users: ["createdAt"],
  registrations: ["startDate", "createdAt"],
  sessions: ["date", "pickedUpAt", "cancelledAt", "createdAt"],
};

const TX_OPTIONS = { timeout: 120000, maxWait: 20000 };

function revive(rows: Row[], fields: string[]) {
  return rows.map((r) => {
    const copy: Row = { ...r };
    for (const f of fields) if (copy[f]) copy[f] = new Date(copy[f] as string);
    return copy;
  });
}

const chunk = <T,>(arr: T[], n: number) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const viDate = () =>
  new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date());

/**
 * Snapshots every student (accounts, registrations, sessions) into a
 * StudentArchive row and deletes them. Returns null when there is nothing to
 * archive. Staff accounts and activity logs are never touched.
 */
async function archiveAndDeleteStudents(tx: Tx, actor: Actor, label: string) {
  const users = await tx.user.findMany({ where: { role: "STUDENT" } });
  if (users.length === 0) return null;

  const ids = users.map((u) => u.id);
  const registrations = await tx.mealRegistration.findMany({ where: { studentId: { in: ids } } });
  const sessions = await tx.mealSession.findMany({ where: { studentId: { in: ids } } });

  const archive = await tx.studentArchive.create({
    data: {
      label,
      createdById: actor.id,
      createdByName: actor.name,
      studentCount: users.length,
      sessionCount: sessions.length,
      data: JSON.parse(JSON.stringify({ users, registrations, sessions })) as Prisma.InputJsonValue,
    },
  });

  await tx.mealSession.updateMany({ where: { studentId: { in: ids } }, data: { compensationForId: null } });
  await tx.mealSession.deleteMany({ where: { studentId: { in: ids } } });
  await tx.mealRegistration.deleteMany({ where: { studentId: { in: ids } } });
  await tx.user.deleteMany({ where: { role: "STUDENT" } });

  return archive;
}

export async function resetAllStudents(actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const archive = await archiveAndDeleteStudents(tx, actor, `Reset ngày ${viDate()}`);
    if (!archive) throw new Error("Không có sinh viên nào để reset.");
    return archive;
  }, TX_OPTIONS);
}

/**
 * Brings an archive back. Whatever students exist right now are archived
 * first (so nothing is lost), then the archived data replaces them.
 */
export async function restoreArchive(archiveId: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const archive = await tx.studentArchive.findUnique({ where: { id: archiveId } });
    if (!archive) throw new Error("Không tìm thấy bản lưu trữ.");
    const snap = archive.data as unknown as Snapshot;

    const safety = await archiveAndDeleteStudents(tx, actor, `Tự động lưu trước khi khôi phục "${archive.label}"`);

    const phones = snap.users.map((u) => String(u.phone));
    const clash = await tx.user.findMany({ where: { phone: { in: phones } }, select: { name: true, phone: true } });
    if (clash.length > 0) {
      throw new Error(
        `Số điện thoại ${clash.map((c) => c.phone).join(", ")} đang thuộc tài khoản nhân sự (${clash
          .map((c) => c.name)
          .join(", ")}), không thể khôi phục.`,
      );
    }

    const existingUserIds = new Set((await tx.user.findMany({ select: { id: true } })).map((u) => u.id));
    const registrations = revive(snap.registrations, DATE_FIELDS.registrations).map((r) => ({
      ...r,
      createdById: existingUserIds.has(String(r.createdById)) ? r.createdById : actor.id,
    }));
    const sessions = revive(snap.sessions, DATE_FIELDS.sessions);

    await tx.user.createMany({ data: revive(snap.users, DATE_FIELDS.users) as Prisma.UserCreateManyInput[] });
    await tx.mealRegistration.createMany({ data: registrations as Prisma.MealRegistrationCreateManyInput[] });
    // compensationForId points at another session: insert unlinked, then link.
    for (const part of chunk(sessions, 1000)) {
      await tx.mealSession.createMany({
        data: part.map((s) => ({ ...s, compensationForId: null })) as Prisma.MealSessionCreateManyInput[],
      });
    }
    for (const s of sessions.filter((x) => x.compensationForId)) {
      await tx.mealSession.update({
        where: { id: String(s.id) },
        data: { compensationForId: String(s.compensationForId) },
      });
    }

    return { archive, safetyArchive: safety, restored: { students: snap.users.length, sessions: sessions.length } };
  }, TX_OPTIONS);
}
