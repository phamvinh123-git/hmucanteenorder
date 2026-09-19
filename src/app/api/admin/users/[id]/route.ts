import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessAdmin, DEFAULT_STUDENT_PASSWORD, getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/log";

const schema = z.object({
  active: z.boolean().optional(),
  role: z.enum(["ADMIN", "MANAGER", "SALES", "STUDENT"]).optional(),
  resetPassword: z.boolean().optional(),
});

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
  if (typeof data.active === "boolean") updateData.active = data.active;
  if (data.role) updateData.role = data.role;
  if (data.resetPassword) {
    updateData.passwordHash = await hashPassword(DEFAULT_STUDENT_PASSWORD);
    updateData.mustChangePassword = true;
  }

  const user = await prisma.user.update({ where: { id }, data: updateData });
  await logActivity(session.userId, "UPDATE_USER", `Cập nhật tài khoản ${user.name} (${user.phone}): ${JSON.stringify(data)}`);

  return NextResponse.json({ ok: true });
}
