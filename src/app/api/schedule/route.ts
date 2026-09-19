import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";
import { syncCompletedSessions } from "@/lib/meal-logic";

function parseWeekStart(param: string | null): Date {
  const base = param ? new Date(param) : new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const weekStart = parseWeekStart(req.nextUrl.searchParams.get("weekStart"));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  await syncCompletedSessions();

  const sessions = await prisma.mealSession.findMany({
    where: {
      date: { gte: weekStart, lt: weekEnd },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    select: {
      id: true,
      date: true,
      mealType: true,
      status: true,
      note: true,
      price: true,
      pickedUp: true,
      student: { select: { id: true, name: true, phone: true, orderCode: true, group: true } },
    },
    orderBy: [{ student: { orderCode: "asc" } }, { student: { name: "asc" } }],
  });

  return NextResponse.json({
    weekStart: weekStart.toISOString(),
    sessions: sessions.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      mealType: s.mealType,
      status: s.status,
      note: s.note,
      price: s.price,
      pickedUp: s.pickedUp,
      studentId: s.student.id,
      studentName: s.student.name,
      studentPhone: s.student.phone,
      orderCode: s.student.orderCode,
      group: s.student.group,
    })),
  });
}
