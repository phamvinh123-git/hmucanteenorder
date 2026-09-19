import { NextResponse } from "next/server";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { backfillMissingOrderCodes } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

export async function POST() {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const count = await backfillMissingOrderCodes();
  await logActivity(session.userId, "BACKFILL_ORDER_CODES", `Gán mã thứ tự cho ${count} sinh viên chưa có mã`);

  return NextResponse.json({ ok: true, count });
}
