import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { logActivity } from "@/lib/log";

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  pickedUp: z.boolean(),
});

// Ticks (or unticks) "Đã lấy" for every session id in one call — used by the "Chọn tất cả" button
// on the schedule's per-meal list, so marking a full sitting doesn't take one request per student.
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const { ids, pickedUp } = parsed.data;

  const result = await prisma.mealSession.updateMany({
    where: { id: { in: ids } },
    data: { pickedUp, pickedUpAt: pickedUp ? new Date() : null },
  });

  await logActivity(
    session.userId,
    "BULK_PICKUP",
    `${pickedUp ? "Tích" : "Bỏ tích"} "Đã lấy" cho ${result.count} suất ăn cùng lúc`,
  );

  return NextResponse.json({ ok: true, count: result.count });
}
