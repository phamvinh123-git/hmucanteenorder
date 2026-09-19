import { NextRequest, NextResponse } from "next/server";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { syncCompletedSessions } from "@/lib/meal-logic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const range = req.nextUrl.searchParams.get("range") ?? "week";
  const dateParam = req.nextUrl.searchParams.get("date");
  const refDate = dateParam ? new Date(dateParam) : new Date();

  let start: Date;
  let end: Date;
  if (range === "custom") {
    const startParam = req.nextUrl.searchParams.get("start");
    const endParam = req.nextUrl.searchParams.get("end");
    if (!startParam || !endParam) {
      return NextResponse.json({ error: "Thiếu ngày bắt đầu hoặc kết thúc." }, { status: 400 });
    }
    const rawStart = startOfDay(new Date(startParam));
    const rawEnd = endOfDay(new Date(endParam));
    if (Number.isNaN(rawStart.getTime()) || Number.isNaN(rawEnd.getTime())) {
      return NextResponse.json({ error: "Ngày không hợp lệ." }, { status: 400 });
    }
    if (rawEnd < rawStart) {
      return NextResponse.json({ error: "Ngày kết thúc phải sau ngày bắt đầu." }, { status: 400 });
    }
    if (rawEnd.getTime() - rawStart.getTime() > 366 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Khoảng ngày tối đa là 366 ngày." }, { status: 400 });
    }
    start = rawStart;
    end = rawEnd;
  } else if (range === "day") {
    start = startOfDay(refDate);
    end = endOfDay(refDate);
  } else if (range === "month") {
    start = startOfMonth(refDate);
    end = endOfMonth(refDate);
  } else {
    start = startOfWeek(refDate, { weekStartsOn: 1 });
    end = endOfWeek(refDate, { weekStartsOn: 1 });
  }

  await syncCompletedSessions();

  const sessions = await prisma.mealSession.findMany({
    where: { date: { gte: start, lte: end } },
    select: {
      studentId: true,
      status: true,
      pickedUp: true,
      student: { select: { name: true, orderCode: true, group: true } },
    },
  });

  type Row = {
    studentId: string;
    name: string;
    orderCode: number | null;
    group: string | null;
    booked: number;
    eaten: number;
  };
  const byStudent = new Map<string, Row>();

  for (const s of sessions) {
    let row = byStudent.get(s.studentId);
    if (!row) {
      row = {
        studentId: s.studentId,
        name: s.student.name,
        orderCode: s.student.orderCode,
        group: s.student.group,
        booked: 0,
        eaten: 0,
      };
      byStudent.set(s.studentId, row);
    }
    if (s.status !== "CANCELLED") row.booked += 1;
    if (s.pickedUp) row.eaten += 1;
  }

  const rows = Array.from(byStudent.values())
    .filter((r) => r.booked > 0 || r.eaten > 0)
    .sort((a, b) => {
      if (a.orderCode != null && b.orderCode != null) return a.orderCode - b.orderCode;
      if (a.orderCode != null) return -1;
      if (b.orderCode != null) return 1;
      return a.name.localeCompare(b.name, "vi");
    });

  return NextResponse.json({
    range,
    start: start.toISOString(),
    end: end.toISOString(),
    rows,
    summary: {
      totalStudents: rows.length,
      totalBooked: rows.reduce((sum, r) => sum + r.booked, 0),
      totalEaten: rows.reduce((sum, r) => sum + r.eaten, 0),
    },
  });
}
