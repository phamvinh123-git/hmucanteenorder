import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessStats, getSession } from "@/lib/auth";
import { moveDuplicateSession } from "@/lib/meal-logic";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

// Manager/admin: a student has two meals at the same day and meal; this moves the extra one to a free day.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được dời buổi ăn trùng." }, { status: 403 });
  }
  const { id } = await params;

  const target = await prisma.mealSession.findUnique({ where: { id }, include: { student: true } });
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy buổi ăn." }, { status: 404 });
  }

  try {
    const result = await moveDuplicateSession(id);
    await logActivity(
      session.userId,
      "MOVE_DUPLICATE_SESSION",
      `Dời buổi ${target.mealType === "LUNCH" ? "trưa" : "tối"} ngày ${localDateKey(target.date)} của ${target.student.name} (${target.student.phone}) bị trùng sang ${localDateKey(result.moved.date)} (${result.moved.mealType === "LUNCH" ? "trưa" : "tối"})`,
    );
    return NextResponse.json({ ok: true, moved: result.moved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể dời buổi ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
