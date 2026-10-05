import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cancelOfficerSession, cancelSessionAndExtend } from "@/lib/meal-logic";
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

  // Anyone may cancel their own meal: a student, an officer, or a manager who is also an officer.
  const isOwner = target.studentId === session.userId;
  const isAdmin = session.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Không có quyền hủy buổi ăn này." }, { status: 403 });
  }

  try {
    // Officers order week by week, so cancelling a day just drops it: no make-up slot is appended.
    const owner = await prisma.user.findUnique({ where: { id: target.studentId }, select: { isOfficer: true } });
    if (owner?.isOfficer) {
      await cancelOfficerSession(id, { bypassDeadline: isAdmin && !isOwner });
      await logActivity(
        session.userId,
        "CANCEL_SESSION",
        `Hủy cơm trưa ngày ${localDateKey(target.date)} của cán bộ (không bù)`,
      );
      return NextResponse.json({ ok: true });
    }
    const result = await cancelSessionAndExtend(id, { bypassDeadline: isAdmin && !isOwner });
    await logActivity(
      session.userId,
      "CANCEL_SESSION",
      `Hủy buổi ăn ngày ${localDateKey(target.date)} (${target.mealType}), tự động thêm buổi ${localDateKey(
        result.newSession.date,
      )} (${result.newSession.mealType})`,
    );
    return NextResponse.json({ ok: true, newSession: result.newSession });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể hủy buổi ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
