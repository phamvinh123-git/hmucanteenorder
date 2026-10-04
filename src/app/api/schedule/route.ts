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
  // Students and officers (cán bộ) are listed separately; students are the default.
  const groupParam = req.nextUrl.searchParams.get("group");
  const roleFilter =
    groupParam === "OFFICER" ? "OFFICER" : groupParam === "ALL" ? { in: ["STUDENT", "OFFICER"] as ("STUDENT" | "OFFICER")[] } : "STUDENT";
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  await syncCompletedSessions();

  const sessions = await prisma.mealSession.findMany({
    where: {
      date: { gte: weekStart, lt: weekEnd },
      status: { in: ["SCHEDULED", "COMPLETED"] },
      student: { role: roleFilter },
    },
    select: {
      id: true,
      date: true,
      mealType: true,
      status: true,
      note: true,
      price: true,
      pickedUp: true,
      student: { select: { id: true, name: true, phone: true, staffCode: true, role: true, orderCode: true, major: true, className: true } },
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
      // Officers' meal prices are not shown anywhere.
      price: s.student.role === "OFFICER" ? 0 : s.price,
      pickedUp: s.pickedUp,
      studentId: s.student.id,
      studentName: s.student.name,
      studentPhone: s.student.phone,
      staffCode: s.student.staffCode,
      studentRole: s.student.role,
      orderCode: s.student.orderCode,
      major: s.student.major,
      className: s.student.className,
    })),
  });
}
