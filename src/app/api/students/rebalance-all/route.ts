import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessAdmin, getSession } from "@/lib/auth";
import { rebalanceRegistration, registrationBalances, syncCompletedSessions } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

// Admin-only: gives every student registration the meals it is short of (see rebalanceRegistration).
export async function POST() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  await syncCompletedSessions();
  const registrations = await prisma.mealRegistration.findMany({
    where: { student: { role: "STUDENT", active: true } },
    select: { id: true, totalSessions: true },
  });
  const balances = await registrationBalances(registrations);
  const short = registrations.filter((r) => (balances.get(r.id)?.missing ?? 0) > 0);

  let added = 0;
  let students = 0;
  const failed: string[] = [];
  for (const r of short) {
    try {
      const result = await rebalanceRegistration(r.id);
      if (result.added > 0) {
        added += result.added;
        students += 1;
      }
    } catch (err) {
      failed.push(err instanceof Error ? err.message : "lỗi");
    }
  }

  await logActivity(
    session.userId,
    "REBALANCE_ALL",
    `Bù buổi còn thiếu cho ${students} đợt đăng ký, tổng ${added} buổi${failed.length ? `; ${failed.length} đợt không bù được` : ""}`,
  );
  return NextResponse.json({ ok: failed.length === 0, registrations: students, added, failed: failed.length });
}
