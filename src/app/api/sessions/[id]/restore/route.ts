import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { restoreSession } from "@/lib/meal-logic";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  const { id } = await params;

  const target = await prisma.mealSession.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy buổi ăn." }, { status: 404 });
  }

  const isOwner = target.studentId === session.userId && session.role === "STUDENT";
  const isStaff = canAccessSalesTools(session.role);
  if (!isOwner && !isStaff) {
    return NextResponse.json({ error: "Không có quyền khôi phục buổi ăn này." }, { status: 403 });
  }

  try {
    // Staff acting on a student's behalf (e.g. the student missed the self-service cutoff) skip the deadline check.
    const result = await restoreSession(id, { bypassDeadline: isStaff });
    await logActivity(
      session.userId,
      "RESTORE_SESSION",
      `Khôi phục buổi ăn ngày ${localDateKey(target.date)} (${target.mealType}), xóa suất bù đã thêm trước đó${
        isStaff ? " (nhân viên khôi phục hộ)" : ""
      }`,
    );
    return NextResponse.json({ ok: true, restored: result.restored, removedCompensationId: result.removedCompensationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể khôi phục buổi ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
