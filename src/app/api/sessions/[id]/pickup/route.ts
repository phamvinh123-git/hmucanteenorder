import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { setPickedUp } from "@/lib/meal-logic";

const schema = z.object({ pickedUp: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const target = await prisma.mealSession.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy buổi ăn." }, { status: 404 });
  }

  if (target.status === "CANCELLED") {
    return NextResponse.json({ error: "Buổi ăn này đã hủy, không thể tích đã lấy." }, { status: 400 });
  }

  await setPickedUp([id], parsed.data.pickedUp);

  return NextResponse.json({ ok: true });
}
