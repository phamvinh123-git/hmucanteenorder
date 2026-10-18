import { NextResponse } from "next/server";
import { canAccessStats, getSession } from "@/lib/auth";
import { compactAllStudents, syncCompletedSessions } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

// Manager/admin: closes the gaps in every student's upcoming make-up meals (see compactStudentUpcoming).
// Only days move; nobody gains or loses a meal.
export async function POST() {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được dồn lịch bù." }, { status: 403 });
  }

  await syncCompletedSessions();
  const result = await compactAllStudents();
  if (result.moved > 0) {
    await logActivity(
      session.userId,
      "COMPACT_MAKEUPS",
      `Dồn các buổi bù về liền ngày: ${result.touched}/${result.students} sinh viên, dời ${result.moved} buổi bù vào chỗ trống`,
    );
  }
  return NextResponse.json({ ok: true, ...result });
}
