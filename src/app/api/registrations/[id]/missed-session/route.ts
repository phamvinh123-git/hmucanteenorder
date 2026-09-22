import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { recordMissedSession } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

const schema = z.object({
  date: z.string().min(1),
  mealType: z.enum(["LUNCH", "DINNER"]),
});

// Staff-only fix for a booking mistake: registers a meal the student already ate but that never
// got entered (e.g. "start from dinner" was picked although lunch that day was already served).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const registration = await prisma.mealRegistration.findUnique({ where: { id }, include: { student: true } });
  if (!registration) {
    return NextResponse.json({ error: "Không tìm thấy đợt đăng ký." }, { status: 404 });
  }

  try {
    const result = await recordMissedSession({
      registrationId: id,
      date: new Date(parsed.data.date),
      mealType: parsed.data.mealType,
    });
    await logActivity(
      session.userId,
      "RECORD_MISSED_SESSION",
      `Ghi nhận buổi ${parsed.data.mealType === "LUNCH" ? "trưa" : "tối"} ngày ${parsed.data.date} bị bỏ sót cho ${registration.student.name} (${registration.student.phone})` +
        (result.removedFutureSessionId ? ", tự động bớt 1 buổi cuối để bù" : ", không có buổi tương lai nào để bớt"),
    );
    return NextResponse.json({ ok: true, removedFutureSessionId: result.removedFutureSessionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể ghi nhận buổi ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
