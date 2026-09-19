import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { syncCompletedSessions } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  const { id } = await params;

  const isSelf = session.userId === id;
  if (!isSelf && !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  await syncCompletedSessions(id);

  const student = await prisma.user.findUnique({
    where: { id },
    include: {
      registrations: { orderBy: { createdAt: "desc" } },
      sessions: { orderBy: { date: "asc" } },
    },
  });

  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "Không tìm thấy sinh viên." }, { status: 404 });
  }

  return NextResponse.json({
    id: student.id,
    name: student.name,
    phone: student.phone,
    orderCode: student.orderCode,
    group: student.group,
    registrations: student.registrations,
    sessions: student.sessions,
  });
}

const patchSchema = z.object({
  orderCode: z.union([z.coerce.number().int().min(1).max(999999), z.null()]).optional(),
  group: z.union([z.string().max(100), z.null()]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const student = await prisma.user.findUnique({ where: { id } });
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "Không tìm thấy sinh viên." }, { status: 404 });
  }

  const data: { orderCode?: number | null; group?: string | null } = {};

  if ("orderCode" in parsed.data) {
    const orderCode = parsed.data.orderCode ?? null;
    if (orderCode !== null) {
      const conflict = await prisma.user.findFirst({
        where: { orderCode, id: { not: id } },
      });
      if (conflict) {
        return NextResponse.json({ error: `Mã số ${orderCode} đã được dùng cho ${conflict.name}.` }, { status: 400 });
      }
    }
    data.orderCode = orderCode;
  }

  if ("group" in parsed.data) {
    data.group = parsed.data.group || null;
  }

  await prisma.user.update({ where: { id }, data });

  if ("orderCode" in data) {
    await logActivity(session.userId, "UPDATE_ORDER_CODE", `Đặt mã số ${data.orderCode ?? "(trống)"} cho ${student.name} (${student.phone})`);
  }
  if ("group" in data) {
    await logActivity(session.userId, "UPDATE_STUDENT_GROUP", `Đặt tổ "${data.group ?? "(trống)"}" cho ${student.name} (${student.phone})`);
  }

  return NextResponse.json({ ok: true });
}
