import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessStats, getSession } from "@/lib/auth";
import { syncCompletedSessions } from "@/lib/meal-logic";

// Manager/admin: scans every student for double bookings, i.e. two live (not cancelled) meals at the same day
// and meal. Read-only; the fix is the per-meal "move to a free day" action.
export async function GET() {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được quét." }, { status: 403 });
  }

  await syncCompletedSessions();

  const groups = await prisma.mealSession.groupBy({
    by: ["studentId", "date", "mealType"],
    where: { status: { not: "CANCELLED" }, student: { role: "STUDENT" } },
    having: { id: { _count: { gt: 1 } } },
    _count: { id: true },
  });
  const studentIds = Array.from(new Set(groups.map((g) => g.studentId)));
  if (studentIds.length === 0) return NextResponse.json({ checked: await countStudents(), students: [] });

  const sessions = await prisma.mealSession.findMany({
    where: { studentId: { in: studentIds }, status: { not: "CANCELLED" } },
    select: {
      id: true,
      studentId: true,
      date: true,
      mealType: true,
      status: true,
      pickedUp: true,
      registration: { select: { startDate: true } },
      student: { select: { name: true, phone: true, orderCode: true } },
    },
    orderBy: { date: "asc" },
  });

  const students = studentIds.map((studentId) => {
    const mine = groups.filter((g) => g.studentId === studentId);
    const first = sessions.find((s) => s.studentId === studentId)!;
    return {
      studentId,
      name: first.student.name,
      phone: first.student.phone,
      orderCode: first.student.orderCode,
      slots: mine
        .map((g) => ({
          date: g.date.toISOString(),
          mealType: g.mealType,
          sessions: sessions
            .filter((s) => s.studentId === studentId && s.mealType === g.mealType && s.date.getTime() === g.date.getTime())
            .map((s) => ({
              id: s.id,
              status: s.status,
              pickedUp: s.pickedUp,
              registrationStart: s.registration.startDate.toISOString(),
            })),
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  });
  students.sort((a, b) => (a.orderCode ?? 1e9) - (b.orderCode ?? 1e9) || a.name.localeCompare(b.name, "vi"));

  return NextResponse.json({ checked: await countStudents(), students });
}

function countStudents() {
  return prisma.user.count({ where: { role: "STUDENT" } });
}
