import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";

const schema = z.object({ note: z.string().max(500) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  const { id } = await params;

  const target = await prisma.mealSession.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Không tìm thấy buổi ăn." }, { status: 404 });
  }

  const isOwner = target.studentId === session.userId && session.role === "STUDENT";
  if (!isOwner && !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền chỉnh sửa." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Ghi chú không hợp lệ." }, { status: 400 });
  }

  await prisma.mealSession.update({ where: { id }, data: { note: parsed.data.note } });
  return NextResponse.json({ ok: true });
}
