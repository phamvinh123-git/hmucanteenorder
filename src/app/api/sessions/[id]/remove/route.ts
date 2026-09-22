import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessStats, getSession } from "@/lib/auth";
import { removeScheduledSession } from "@/lib/meal-logic";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

// Manager/admin-only: permanently drop one scheduled (unused) meal, no compensation added.
// Used to fix an accidental over-count, e.g. a make-up meal registered twice by mistake.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được xóa buổi ăn." }, { status: 403 });
  }
  const { id } = await params;

  const target = await prisma.mealSession.findUnique({ where: { id }, include: { student: true } });
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy buổi ăn." }, { status: 404 });
  }

  try {
    await removeScheduledSession(id);
    await logActivity(
      session.userId,
      "REMOVE_SESSION",
      `Xóa buổi ${target.mealType === "LUNCH" ? "trưa" : "tối"} ngày ${localDateKey(target.date)} của ${target.student.name} (${target.student.phone}) để chỉnh số buổi bị dư`,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể xóa buổi ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
