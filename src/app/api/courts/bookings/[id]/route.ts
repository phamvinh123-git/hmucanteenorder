import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canApproveCourts, slotStartsAt } from "@/lib/courts";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(200).optional(),
});

// Union / admin: approve or reject a student's booking.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!canApproveCourts(session.role)) return NextResponse.json({ error: "Không có quyền duyệt." }, { status: 403 });
  const { id } = await params;

  const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const booking = await prisma.courtBooking.findUnique({
    where: { id },
    include: { court: true, slot: true, user: { select: { name: true } } },
  });
  if (!booking) return NextResponse.json({ error: "Không tìm thấy lượt đặt." }, { status: 404 });
  if (booking.status !== "PENDING") return NextResponse.json({ error: "Lượt đặt này đã được xử lý." }, { status: 409 });
  const approve = parsed.data.decision === "approve";
  if (approve && slotStartsAt(booking.date, booking.slot.startTime) <= new Date()) {
    return NextResponse.json({ error: "Ca này đã bắt đầu hoặc đã qua, không duyệt được." }, { status: 400 });
  }

  await prisma.courtBooking.update({
    where: { id },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      decidedById: session.userId,
      decidedAt: new Date(),
      decisionNote: parsed.data.reason || null,
    },
  });
  await logActivity(
    session.userId,
    "COURT_DECIDE",
    `${approve ? "Duyệt" : "Từ chối"} ${booking.court.name} ${booking.slot.startTime}-${booking.slot.endTime} ngày ${localDateKey(booking.date)} của ${booking.user.name}`,
  );
  return NextResponse.json({ ok: true });
}

// Cancel a booking: its owner until the slot starts; union and admin at any time.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const { id } = await params;

  const booking = await prisma.courtBooking.findUnique({ where: { id }, include: { court: true, slot: true } });
  if (!booking) return NextResponse.json({ error: "Không tìm thấy lượt đặt." }, { status: 404 });
  const owner = booking.userId === session.userId;
  const approver = canApproveCourts(session.role);
  if (!owner && !approver) return NextResponse.json({ error: "Không có quyền hủy lượt đặt này." }, { status: 403 });
  if (booking.status !== "PENDING" && booking.status !== "APPROVED") {
    return NextResponse.json({ error: "Lượt đặt này không còn hiệu lực." }, { status: 409 });
  }
  if (!approver && slotStartsAt(booking.date, booking.slot.startTime) <= new Date()) {
    return NextResponse.json({ error: "Ca này đã bắt đầu, không hủy được." }, { status: 400 });
  }

  await prisma.courtBooking.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await logActivity(
    session.userId,
    "COURT_CANCEL",
    `Hủy ${booking.court.name} ${booking.slot.startTime}-${booking.slot.endTime} ngày ${localDateKey(booking.date)}${owner ? "" : " (hủy hộ)"}`,
  );
  return NextResponse.json({ ok: true });
}
