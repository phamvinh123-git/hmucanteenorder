import { NextResponse } from "next/server";
import { canAccessAdmin, getSession } from "@/lib/auth";
import { auditStudentRegistrations, syncCompletedSessions } from "@/lib/meal-logic";

// Admin-only: runs the meal audit right now (it also runs by itself every few minutes). Every student
// registration that does not add up is brought back in line, see reconcileRegistration.
export async function POST() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  await syncCompletedSessions();
  const result = await auditStudentRegistrations();
  return NextResponse.json({ ok: result.failed === 0, ...result });
}
