import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { moveCompensationSession } from "@/lib/meal-logic";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mealType: z.enum(["LUNCH", "DINNER"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Ngày hoặc bữa ăn không hợp lệ." }, { status: 400 });
  }

  const target = await prisma.mealSession.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy buổi ăn." }, { status: 404 });
  }

  const isOwner = target.studentId === session.userId && session.role === "STUDENT";
  const isAdmin = session.role === "ADMIN";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Không có quyền đổi buổi ăn này." }, { status: 403 });
  }

  const [y, m, d] = parsed.data.date.split("-").map(Number);

  try {
    const moved = await moveCompensationSession(
      id,
      { date: new Date(y, m - 1, d), mealType: parsed.data.mealType },
      { bypassDeadline: isAdmin },
    );
    await logActivity(
      session.userId,
      "MOVE_SESSION",
      `Đổi buổi bù từ ${localDateKey(target.date)} (${target.mealType}) sang ${localDateKey(moved.date)} (${moved.mealType})`,
    );
    return NextResponse.json({ ok: true, date: moved.date.toISOString(), mealType: moved.mealType });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể đổi buổi ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
