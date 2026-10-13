import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessStats, getSession } from "@/lib/auth";
import { updateRegistrationPackage } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

const schema = z.object({
  totalSessions: z.coerce.number().int().min(1, "Số buổi phải từ 1 trở lên.").max(200, "Số buổi tối đa là 200.").optional(),
  pricePerMeal: z.coerce.number().int().min(0, "Giá không hợp lệ.").max(1_000_000, "Giá không hợp lệ.").optional(),
  note: z.string().trim().max(200).nullable().optional(),
  priceForEaten: z.boolean().optional(),
});

// Manager/admin: edit a meal package (number of meals, price per meal, note).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được chỉnh sửa gói ăn." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const registration = await prisma.mealRegistration.findUnique({ where: { id }, include: { student: true } });
  if (!registration) {
    return NextResponse.json({ error: "Không tìm thấy gói ăn." }, { status: 404 });
  }

  try {
    const result = await updateRegistrationPackage({
      registrationId: id,
      ...parsed.data,
      note: parsed.data.note === "" ? null : parsed.data.note,
    });
    if (result.summary.length > 0) {
      await logActivity(
        session.userId,
        "UPDATE_REGISTRATION",
        `Sửa gói ăn của ${registration.student.name} (${registration.student.phone}): ${result.summary.join(", ")}`,
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể sửa gói ăn.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
