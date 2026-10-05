import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessAdmin, DEFAULT_STUDENT_PASSWORD, getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/log";

const schema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MANAGER", "SALES", "STUDENT", "OFFICER"]).optional(),
  // Marks a manager/sales/admin as also being an officer (cán bộ), with the same login.
  isOfficer: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
  // Correcting a wrong phone number or staff code (an empty phone gives an officer back the placeholder).
  phone: z.string().trim().max(20).optional(),
  staffCode: z.string().trim().max(40).optional(),
});

const PHONE_RE = /^[0-9]{9,15}$/;
const CODE_RE = /^[A-Za-z0-9._-]{3,30}$/;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const data = parsed.data;

  if (id === session.userId && (data.active === false || (data.role && data.role !== "ADMIN"))) {
    return NextResponse.json({ error: "Không thể tự khóa hoặc hạ quyền tài khoản của chính mình." }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (data.phone !== undefined || data.staffCode !== undefined) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });

    let becomesOfficer = false;
    let nextCode = target.staffCode;
    let nextPhone = target.phone;
    // An officer with no phone of their own has the staff code in the phone column as a placeholder.
    const hadPlaceholder = !!target.staffCode && target.phone === target.staffCode;

    // An empty code means "leave the code alone". Giving a code to a manager / sales / admin account
    // also makes them an officer (one login, both roles), so no separate toggle is needed first.
    if (data.staffCode !== undefined && data.staffCode !== "") {
      if (target.role === "STUDENT") {
        return NextResponse.json({ error: "Sinh viên không có mã cán bộ." }, { status: 400 });
      }
      if (!CODE_RE.test(data.staffCode)) {
        return NextResponse.json({ error: "Mã cán bộ gồm 3–30 ký tự chữ, số, dấu chấm, gạch ngang hoặc gạch dưới." }, { status: 400 });
      }
      nextCode = data.staffCode.toUpperCase();
      becomesOfficer = !target.isOfficer && target.role !== "OFFICER";
      if (hadPlaceholder && data.phone === undefined) nextPhone = nextCode;
    }

    if (data.phone !== undefined) {
      if (data.phone === "") {
        if (!nextCode) return NextResponse.json({ error: "Tài khoản này cần có số điện thoại." }, { status: 400 });
        nextPhone = nextCode;
      } else if (!PHONE_RE.test(data.phone)) {
        return NextResponse.json({ error: "Số điện thoại gồm 9–15 chữ số." }, { status: 400 });
      } else {
        nextPhone = data.phone;
      }
    }

    // Both columns are logins, so neither value may match anyone else's phone or staff code.
    const ids = Array.from(new Set([nextPhone, nextCode].filter((v): v is string => !!v)));
    const clash = await prisma.user.findFirst({
      where: { id: { not: id }, OR: [{ phone: { in: ids } }, { staffCode: { in: ids } }] },
    });
    if (clash) {
      return NextResponse.json({ error: `Số điện thoại hoặc mã này đã thuộc về "${clash.name}".` }, { status: 409 });
    }

    if (nextPhone !== target.phone) updateData.phone = nextPhone;
    if (nextCode !== target.staffCode) updateData.staffCode = nextCode;
    if (becomesOfficer) updateData.isOfficer = true;
    if (Object.keys(updateData).length > 0) {
      await logActivity(
        session.userId,
        "UPDATE_USER",
        `Sửa thông tin đăng nhập của ${target.name}: SĐT ${target.phone} → ${nextPhone}, mã cán bộ ${target.staffCode ?? "(không)"} → ${nextCode ?? "(không)"}`,
      );
    }
  }

  if (typeof data.active === "boolean") updateData.active = data.active;
  if (data.role) {
    updateData.role = data.role;
    // OFFICER accounts are officers by definition; a student never is. Other roles keep their flag.
    if (data.role === "OFFICER") updateData.isOfficer = true;
    else if (data.role === "STUDENT") updateData.isOfficer = false;
  }
  if (typeof data.isOfficer === "boolean" && data.role !== "OFFICER" && data.role !== "STUDENT") {
    updateData.isOfficer = data.isOfficer;
  }
  if (data.resetPassword) {
    updateData.passwordHash = await hashPassword(DEFAULT_STUDENT_PASSWORD);
    updateData.mustChangePassword = true;
  }

  const user = await prisma.user.update({ where: { id }, data: updateData });
  if (data.phone === undefined && data.staffCode === undefined) {
    await logActivity(session.userId, "UPDATE_USER", `Cập nhật tài khoản ${user.name} (${user.phone}): ${JSON.stringify(data)}`);
  }

  return NextResponse.json({ ok: true });
}
