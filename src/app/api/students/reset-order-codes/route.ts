import { NextResponse } from "next/server";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { resetAllOrderCodes } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

export async function POST() {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  await resetAllOrderCodes();
  await logActivity(session.userId, "RESET_ORDER_CODES", "Reset toàn bộ mã thứ tự sinh viên cho kỳ học mới");

  return NextResponse.json({ ok: true });
}
