import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageCourts } from "@/lib/courts";
import { logActivity } from "@/lib/log";

async function requireManager() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  if (!canManageCourts(session.role)) return { error: NextResponse.json({ error: "Chỉ Admin được quản lý sân." }, { status: 403 }) };
  return { session };
}

const patchSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên sân.").max(80).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireManager();
  if (error) return error;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  const court = await prisma.court.findUnique({ where: { id } });
  if (!court) return NextResponse.json({ error: "Không tìm thấy sân." }, { status: 404 });
  const { name, description, active } = parsed.data;
  if (name && name !== court.name && (await prisma.court.findUnique({ where: { name }, select: { id: true } }))) {
    return NextResponse.json({ error: "Đã có sân tên này." }, { status: 409 });
  }
  await prisma.court.update({
    where: { id },
    data: { ...(name ? { name } : {}), ...(description !== undefined ? { description: description || null } : {}), ...(active !== undefined ? { active } : {}) },
  });
  await logActivity(session.userId, "COURT_MANAGE", `Sửa sân "${court.name}"${active === undefined ? "" : active ? ": mở lại" : ": tạm ngưng"}`);
  return NextResponse.json({ ok: true });
}

// A court that already has bookings is never deleted (its history stays); stop it instead.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireManager();
  if (error) return error;
  const { id } = await params;
  const court = await prisma.court.findUnique({ where: { id }, select: { name: true } });
  if (!court) return NextResponse.json({ error: "Không tìm thấy sân." }, { status: 404 });
  if ((await prisma.courtBooking.count({ where: { courtId: id } })) > 0) {
    return NextResponse.json({ error: "Sân này đã có lượt đặt nên không xóa được. Hãy tạm ngưng sân." }, { status: 409 });
  }
  await prisma.court.delete({ where: { id } });
  await logActivity(session.userId, "COURT_MANAGE", `Xóa sân "${court.name}"`);
  return NextResponse.json({ ok: true });
}
