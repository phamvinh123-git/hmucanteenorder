import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageCourts, TIME_RE } from "@/lib/courts";
import { logActivity } from "@/lib/log";

async function requireManager() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  if (!canManageCourts(session.role)) return { error: NextResponse.json({ error: "Chỉ Admin được quản lý sân." }, { status: 403 }) };
  return { session };
}

const time = z.string().regex(TIME_RE, "Giờ không hợp lệ");

const addSchema = z
  .object({ startTime: time, endTime: time })
  .refine((s) => s.endTime > s.startTime, { message: "Giờ kết thúc phải sau giờ bắt đầu." });

// Add a time slot to a court.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireManager();
  if (error) return error;
  const { id } = await params;
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  const court = await prisma.court.findUnique({ where: { id }, select: { name: true } });
  if (!court) return NextResponse.json({ error: "Không tìm thấy sân." }, { status: 404 });
  if (await prisma.courtSlot.findUnique({ where: { courtId_startTime: { courtId: id, startTime: parsed.data.startTime } } })) {
    return NextResponse.json({ error: "Sân đã có ca bắt đầu lúc này." }, { status: 409 });
  }
  await prisma.courtSlot.create({ data: { courtId: id, ...parsed.data } });
  await logActivity(session.userId, "COURT_MANAGE", `Thêm ca ${parsed.data.startTime}-${parsed.data.endTime} cho sân "${court.name}"`);
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({ slotId: z.string().min(1), active: z.boolean() });

// Switch a slot on or off (a slot that bookings point to is never deleted).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireManager();
  if (error) return error;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const slot = await prisma.courtSlot.findFirst({ where: { id: parsed.data.slotId, courtId: id }, include: { court: true } });
  if (!slot) return NextResponse.json({ error: "Không tìm thấy ca." }, { status: 404 });
  await prisma.courtSlot.update({ where: { id: slot.id }, data: { active: parsed.data.active } });
  await logActivity(session.userId, "COURT_MANAGE", `${parsed.data.active ? "Mở" : "Tắt"} ca ${slot.startTime}-${slot.endTime} của sân "${slot.court.name}"`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireManager();
  if (error) return error;
  const { id } = await params;
  const slotId = req.nextUrl.searchParams.get("slotId") ?? "";
  const slot = await prisma.courtSlot.findFirst({ where: { id: slotId, courtId: id }, include: { court: true } });
  if (!slot) return NextResponse.json({ error: "Không tìm thấy ca." }, { status: 404 });
  if ((await prisma.courtBooking.count({ where: { slotId } })) > 0) {
    await prisma.courtSlot.update({ where: { id: slotId }, data: { active: false } });
    await logActivity(session.userId, "COURT_MANAGE", `Tắt ca ${slot.startTime}-${slot.endTime} của sân "${slot.court.name}" (đã có lượt đặt)`);
    return NextResponse.json({ ok: true, deactivated: true });
  }
  await prisma.courtSlot.delete({ where: { id: slotId } });
  await logActivity(session.userId, "COURT_MANAGE", `Xóa ca ${slot.startTime}-${slot.endTime} của sân "${slot.court.name}"`);
  return NextResponse.json({ ok: true });
}
