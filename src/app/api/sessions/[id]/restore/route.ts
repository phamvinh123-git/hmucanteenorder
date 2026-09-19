import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
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
  const isAdmin = session.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Không có quyền khôi phục buổi ăn này." }, { status: 403 });
  }

  try {
    const result = await restoreSession(id, { bypassDeadline: isAdmin });
    await logActivity(
      session.userId,
      "RESTORE_SESSION",
      `Khôi phục buổi ăn ngày ${localDateKey(target.date)} (${target.mealType}), xóa suất bù đã thêm trước đó`,
    );
    return NextResponse.json({ ok: true, restored: result.restored, removedCompensationId: result.removedCompensationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể khôi phục buổi ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
