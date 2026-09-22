import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, canAccessStats, getSession } from "@/lib/auth";
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
      sessions: { orderBy: { date: "asc" }, include: { compensatedBy: { select: { id: true } } } },
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
    sessions: student.sessions.map((s) => ({
      id: s.id,
      date: s.date,
      mealType: s.mealType,
      status: s.status,
      pickedUp: s.pickedUp,
      note: s.note,
      // A cancelled session can only be restored if something still points back to it as its make-up slot.
      hasCompensation: s.compensatedBy != null,
    })),
  });
}

const patchSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{9,15}$/, "Số điện thoại gồm 9–15 chữ số.")
    .optional(),
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
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const student = await prisma.user.findUnique({ where: { id } });
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "Không tìm thấy sinh viên." }, { status: 404 });
  }

  const data: { phone?: string; orderCode?: number | null; major?: string | null; className?: string | null } = {};

  if (parsed.data.phone !== undefined && parsed.data.phone !== student.phone) {
    const taken = await prisma.user.findUnique({ where: { phone: parsed.data.phone } });
    if (taken) {
      return NextResponse.json({ error: `Số điện thoại này đã được dùng cho ${taken.name}.` }, { status: 409 });
    }
    data.phone = parsed.data.phone;
  }

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

  if (data.phone) {
    await logActivity(session.userId, "UPDATE_STUDENT_PHONE", `Đổi SĐT của ${student.name}: ${student.phone} → ${data.phone}`);
  }
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

// Permanently removes one student with their registrations and meal sessions (managers and admins only).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được xóa sinh viên." }, { status: 403 });
  }
  const { id } = await params;

  const student = await prisma.user.findUnique({ where: { id } });
  if (!student || student.role !== "STUDENT") {
    return NextResponse.json({ error: "Không tìm thấy sinh viên." }, { status: 404 });
  }

  const sessionCount = await prisma.mealSession.count({ where: { studentId: id } });

  await prisma.$transaction([
    // Break the compensation self-links before the sessions themselves go.
    prisma.mealSession.updateMany({ where: { studentId: id }, data: { compensationForId: null } }),
    prisma.mealSession.deleteMany({ where: { studentId: id } }),
    prisma.mealRegistration.deleteMany({ where: { studentId: id } }),
    prisma.activityLog.updateMany({ where: { userId: id }, data: { userId: null } }),
    prisma.user.delete({ where: { id } }),
  ]);

  await logActivity(
    session.userId,
    "DELETE_STUDENT",
    `Xóa sinh viên ${student.name} (${student.phone}), STT ${student.orderCode ?? "—"}, ${sessionCount} buổi ăn`,
  );

  return NextResponse.json({ ok: true });
}
