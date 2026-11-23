import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { bookableRange, canApproveCourts, courtBookingMode, parseDayKey, slotStartsAt } from "@/lib/courts";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

const bookingSelect = {
  id: true,
  date: true,
  status: true,
  note: true,
  decisionNote: true,
  createdAt: true,
  court: { select: { name: true } },
  slot: { select: { startTime: true, endTime: true } },
} as const;

// scope=mine: my bookings (recent and coming). scope=pending: bookings waiting for approval (union and admin).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const scope = req.nextUrl.searchParams.get("scope");
  const today = startOfDay(new Date());

  if (scope === "pending") {
    if (!canApproveCourts(session.role)) return NextResponse.json({ error: "Không có quyền duyệt." }, { status: 403 });
    const rows = await prisma.courtBooking.findMany({
      where: { status: "PENDING", date: { gte: today } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { ...bookingSelect, user: { select: { name: true, phone: true, major: true, className: true } } },
    });
    return NextResponse.json(rows);
  }

  const rows = await prisma.courtBooking.findMany({
    where: { userId: session.userId, date: { gte: addDays(today, -14) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: bookingSelect,
  });
  return NextResponse.json(rows);
}

const createSchema = z.object({
  slotId: z.string().min(1),
  date: z.string(),
  note: z.string().trim().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const mode = courtBookingMode(session.role);
  if (!mode) return NextResponse.json({ error: "Tài khoản này không đặt sân được." }, { status: 403 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  const day = parseDayKey(parsed.data.date);
  if (!day) return NextResponse.json({ error: "Ngày không hợp lệ." }, { status: 400 });
  const { first, last } = bookableRange();
  if (day < first || day > last) return NextResponse.json({ error: "Chỉ đặt được từ hôm nay đến 14 ngày tới." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { active: true } });
  if (!user?.active) return NextResponse.json({ error: "Tài khoản đã bị khóa." }, { status: 403 });

  const slot = await prisma.courtSlot.findUnique({ where: { id: parsed.data.slotId }, include: { court: true } });
  if (!slot || !slot.active || !slot.court.active) return NextResponse.json({ error: "Ca này không còn mở." }, { status: 404 });
  if (slotStartsAt(day, slot.startTime) <= new Date()) return NextResponse.json({ error: "Ca này đã bắt đầu hoặc đã qua." }, { status: 400 });

  const taken = await prisma.courtBooking.findFirst({
    where: { slotId: slot.id, date: day, status: { in: ["PENDING", "APPROVED"] } },
    select: { id: true },
  });
  if (taken) return NextResponse.json({ error: "Ca này đã có người đặt." }, { status: 409 });

  try {
    const booking = await prisma.courtBooking.create({
      data: {
        courtId: slot.courtId,
        slotId: slot.id,
        date: day,
        userId: session.userId,
        note: parsed.data.note || null,
        status: mode === "instant" ? "APPROVED" : "PENDING",
        ...(mode === "instant" ? { decidedAt: new Date() } : {}),
      },
      select: { id: true, status: true },
    });
    await logActivity(
      session.userId,
      "COURT_BOOK",
      `Đặt ${slot.court.name} ${slot.startTime}-${slot.endTime} ngày ${localDateKey(day)}${mode === "approval" ? " (chờ duyệt)" : ""}`,
    );
    return NextResponse.json(booking);
  } catch (err) {
    // The database's own guard against two live bookings of one slot (two people clicking at the same moment).
    if (typeof err === "object" && err && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "Ca này vừa có người đặt." }, { status: 409 });
    }
    throw err;
  }
}
