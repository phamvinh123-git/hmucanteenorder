import { NextRequest, NextResponse } from "next/server";
import { canAccessStats, getSession } from "@/lib/auth";
import { resetAllStudents } from "@/lib/archive";
import { logActivity } from "@/lib/log";

// Manager/Admin only. The typed confirmation is enforced here too, so a
// stray request can never wipe the student list.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được reset sinh viên." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "RESET") {
    return NextResponse.json({ error: "Thiếu xác nhận. Hãy gõ RESET để xác nhận." }, { status: 400 });
  }

  try {
    const archive = await resetAllStudents({ id: session.userId, name: session.name });
    await logActivity(
      session.userId,
      "RESET_ALL_STUDENTS",
      `Reset toàn bộ sinh viên: đã lưu trữ ${archive.studentCount} sinh viên, ${archive.sessionCount} buổi ăn`,
    );
    return NextResponse.json({
      ok: true,
      archiveId: archive.id,
      studentCount: archive.studentCount,
      sessionCount: archive.sessionCount,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Không thể reset." }, { status: 400 });
  }
}
