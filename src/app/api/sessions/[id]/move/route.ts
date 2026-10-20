import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessStats, getSession } from "@/lib/auth";
import { moveSessionTo } from "@/lib/meal-logic";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

const schema = z.object({
  date: z.string().min(1),
  mealType: z.enum(["LUNCH", "DINNER"]),
});

// Manager/admin: moves a meal that is still to come to another day and meal (see moveSessionTo).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được đổi ngày buổi ăn." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const target = await prisma.mealSession.findUnique({ where: { id }, include: { student: true } });
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy buổi ăn." }, { status: 404 });
  }

  try {
    const [y, m, d] = parsed.data.date.split("-").map(Number);
    const result = await moveSessionTo(id, { date: new Date(y, m - 1, d), mealType: parsed.data.mealType });
    await logActivity(
      session.userId,
      "MOVE_SESSION",
      `Đổi buổi ${target.mealType === "LUNCH" ? "trưa" : "tối"} ngày ${localDateKey(target.date)} của ${target.student.name} (${target.student.phone}) sang ${parsed.data.date} (${parsed.data.mealType === "LUNCH" ? "trưa" : "tối"})`,
    );
    return NextResponse.json({ ok: true, moved: result.moved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể đổi ngày buổi ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
