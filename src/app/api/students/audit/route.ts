import { NextResponse } from "next/server";
import { canAccessStats, getSession } from "@/lib/auth";
import { auditSystem, syncCompletedSessions } from "@/lib/meal-logic";

// Manager/admin: read-only check of every student's meals (double bookings, packages that do not add up, gaps,
// make-up meals out of order, start dates). Changes nothing.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được rà soát." }, { status: 403 });
  }
  await syncCompletedSessions();
  return NextResponse.json(await auditSystem());
}
