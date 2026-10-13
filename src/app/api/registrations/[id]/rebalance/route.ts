import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessStats, getSession } from "@/lib/auth";
import { reconcileRegistration } from "@/lib/meal-logic";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

// Manager/admin: gives one registration the meals it is short of compared with what the student bought.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }
  const { id } = await params;

  const registration = await prisma.mealRegistration.findUnique({ where: { id }, include: { student: true } });
  if (!registration) {
    return NextResponse.json({ error: "Không tìm thấy đợt đăng ký." }, { status: 404 });
  }

  try {
    const result = await reconcileRegistration(id);
    if (result.trimmed > 0) {
      await logActivity(
        session.userId,
        "REBALANCE_REGISTRATION",
        `Bớt ${result.trimmed} buổi dư của ${registration.student.name} (${registration.student.phone}), đợt từ ${localDateKey(registration.startDate)}`,
      );
    }
    if (result.added > 0) {
      await logActivity(
        session.userId,
        "REBALANCE_REGISTRATION",
        `Bù ${result.added} buổi còn thiếu cho ${registration.student.name} (${registration.student.phone}), đợt từ ${localDateKey(registration.startDate)}: ${result.slots
          .map((s) => `${localDateKey(s.date)} ${s.mealType === "LUNCH" ? "trưa" : "tối"}`)
          .join(", ")}`,
      );
    }
    return NextResponse.json({ ok: true, added: result.added, trimmed: result.trimmed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể bù buổi.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
