import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAssignCourtManagers, canManageCourt } from "@/lib/courts";
import { logActivity } from "@/lib/log";

/** The signed-in person and the court, when they may manage that court. */
async function requireCourt(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  const court = await prisma.court.findUnique({ where: { id } });
  if (!court) return { error: NextResponse.json({ error: "Không tìm thấy sân." }, { status: 404 }) };
  if (!canManageCourt(session, court)) return { error: NextResponse.json({ error: "Bạn không quản lý sân này." }, { status: 403 }) };
  return { session, court };
}

const patchSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên sân.").max(80).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().optional(),
  managerId: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, court, error } = await requireCourt(id);
  if (error) return error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  const { name, description, active, managerId } = parsed.data;
  if (name && name !== court.name && (await prisma.court.findUnique({ where: { name }, select: { id: true } }))) {
    return NextResponse.json({ error: "Đã có sân tên này." }, { status: 409 });
  }
  if (managerId !== undefined) {
    if (!canAssignCourtManagers(session.role)) {
      return NextResponse.json({ error: "Chỉ Admin hoặc Tổ trưởng chọn được người quản lý sân." }, { status: 403 });
    }
    if (managerId && !(await prisma.user.findFirst({ where: { id: managerId, role: "COURT_MANAGER", active: true }, select: { id: true } }))) {
      return NextResponse.json({ error: "Người quản lý sân không hợp lệ." }, { status: 400 });
    }
  }
  await prisma.court.update({
    where: { id },
    data: {
      ...(name ? { name } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(managerId !== undefined ? { managerId: managerId || null } : {}),
    },
  });
  const note = active !== undefined ? (active ? ": mở lại" : ": tạm ngưng") : managerId !== undefined ? ": đổi người quản lý" : "";
  await logActivity(session.userId, "COURT_MANAGE", `Sửa sân "${court.name}"${note}`);
  return NextResponse.json({ ok: true });
}

// A court that already has bookings is never deleted (its history stays); stop it instead.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, court, error } = await requireCourt(id);
  if (error) return error;
  if ((await prisma.courtBooking.count({ where: { courtId: id } })) > 0) {
    return NextResponse.json({ error: "Sân này đã có lượt đặt nên không xóa được. Hãy tạm ngưng sân." }, { status: 409 });
  }
  await prisma.court.delete({ where: { id } });
  await logActivity(session.userId, "COURT_MANAGE", `Xóa sân "${court.name}"`);
  return NextResponse.json({ ok: true });
}
