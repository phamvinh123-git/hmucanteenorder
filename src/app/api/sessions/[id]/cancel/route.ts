import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cancelSessionAndExtend } from "@/lib/meal-logic";
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
    return NextResponse.json({ error: "Không có quyền hủy buổi ăn này." }, { status: 403 });
  }

  try {
    const result = await cancelSessionAndExtend(id, { bypassDeadline: isAdmin });
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
