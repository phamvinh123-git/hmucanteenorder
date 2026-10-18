import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessStats, getSession } from "@/lib/auth";
import { addCancelledWithMakeup } from "@/lib/meal-logic";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

const schema = z.object({
  date: z.string().min(1),
  mealType: z.enum(["LUNCH", "DINNER"]),
});

// Manager/admin: adds a meal the student cancelled but that was never in the schedule, as already cancelled,
// together with its make-up meal. See addCancelledWithMakeup.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được thêm buổi hủy." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const registration = await prisma.mealRegistration.findUnique({ where: { id }, include: { student: true } });
  if (!registration) {
    return NextResponse.json({ error: "Không tìm thấy gói ăn." }, { status: 404 });
  }

  try {
    const [y, m, d] = parsed.data.date.split("-").map(Number);
    const result = await addCancelledWithMakeup({
      registrationId: id,
      date: new Date(y, m - 1, d),
      mealType: parsed.data.mealType,
    });
    await logActivity(
      session.userId,
      "ADD_CANCELLED_MEAL",
      `Hủy hộ ${registration.student.name} (${registration.student.phone}) buổi ${parsed.data.mealType === "LUNCH" ? "trưa" : "tối"} ngày ${parsed.data.date} chưa có trong lịch, thêm buổi bù ${localDateKey(result.newSession.date)} (${result.newSession.mealType === "LUNCH" ? "trưa" : "tối"}), gói tăng 1 buổi`,
    );
    return NextResponse.json({ ok: true, newSession: result.newSession });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể thêm buổi hủy.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
