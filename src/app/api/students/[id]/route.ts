import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { syncCompletedSessions } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";
import { isMajor, isValidClassFor } from "@/lib/student-info";

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
    major: student.major,
    className: student.className,
    registrations: student.registrations,
    sessions: student.sessions,
  });
}

const patchSchema = z.object({
  orderCode: z.union([z.coerce.number().int().min(1).max(999999), z.null()]).optional(),
  major: z.union([z.string(), z.null()]).optional(),
  className: z.union([z.string(), z.null()]).optional(),
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

  const data: { orderCode?: number | null; major?: string | null; className?: string | null } = {};

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

  if ("major" in parsed.data || "className" in parsed.data) {
    const major = "major" in parsed.data ? parsed.data.major || null : student.major;
    if (major && !isMajor(major)) {
      return NextResponse.json({ error: "Ngành không hợp lệ." }, { status: 400 });
    }
    let className = "className" in parsed.data ? parsed.data.className || null : student.className;
    if (className && !isValidClassFor(major, className)) {
      // Changing major can leave the old year invalid (e.g. Y5 outside Bác sĩ y khoa).
      if ("className" in parsed.data) {
        return NextResponse.json(
          { error: major ? "Lớp không hợp lệ với ngành đã chọn." : "Hãy chọn ngành trước khi chọn lớp." },
          { status: 400 },
        );
      }
      className = null;
    }
    data.major = major;
    data.className = className;
  }

  await prisma.user.update({ where: { id }, data });

  if ("orderCode" in data) {
    await logActivity(session.userId, "UPDATE_ORDER_CODE", `Đặt mã số ${data.orderCode ?? "(trống)"} cho ${student.name} (${student.phone})`);
  }
  if ("major" in data) {
    await logActivity(
      session.userId,
      "UPDATE_STUDENT_CLASS",
      `Đặt ngành "${data.major ?? "(trống)"}", lớp "${data.className ?? "(trống)"}" cho ${student.name} (${student.phone})`,
    );
  }

  return NextResponse.json({ ok: true });
}
