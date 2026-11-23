import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  bookableRange,
  canApproveCourts,
  canUseCourts,
  courtBookingMode,
  initialBookingStatus,
  LIVE_STATUSES,
  parseDayKey,
  slotStartsAt,
} from "@/lib/courts";

// The booking board of one day: every active court with its slots and who holds each one.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!canUseCourts(session.roles)) return NextResponse.json({ error: "Không có quyền đặt sân." }, { status: 403 });

  const day = parseDayKey(req.nextUrl.searchParams.get("date") ?? "");
  if (!day) return NextResponse.json({ error: "Ngày không hợp lệ." }, { status: 400 });
  const { first, last } = bookableRange();
  if (day < first || day > last) return NextResponse.json({ error: "Chỉ xem được các ngày từ hôm nay trở đi." }, { status: 400 });

  const [courts, bookings] = await Promise.all([
    prisma.court.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { slots: { where: { active: true }, orderBy: { startTime: "asc" } }, manager: { select: { name: true } } },
    }),
    prisma.courtBooking.findMany({
      where: { date: day, status: { in: LIVE_STATUSES } },
      include: { user: { select: { name: true } } },
    }),
  ]);
  const bySlot = new Map(bookings.map((b) => [b.slotId, b]));
  const approver = canApproveCourts(session.roles);
  const now = new Date();

  return NextResponse.json({
    mode: courtBookingMode(session.roles),
    courts: courts.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      managerName: c.manager?.name ?? null,
      // What happens to a booking made now: approved at once, or it waits for the union (and the court's manager).
      startsAs: initialBookingStatus(session.roles, c),
      slots: c.slots.map((s) => {
        const b = bySlot.get(s.id);
        const mine = b?.userId === session.userId;
        return {
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          past: slotStartsAt(day, s.startTime) <= now,
          booking: b
            ? { id: b.id, status: b.status, mine, who: mine || approver ? b.user.name : null, note: mine || approver ? b.note : null }
            : null,
        };
      }),
    })),
  });
}
