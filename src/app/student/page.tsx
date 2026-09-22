import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { syncCompletedSessions } from "@/lib/meal-logic";
import AppShell from "@/components/AppShell";
import StudentDashboard from "./StudentDashboard";

export default async function StudentPage() {
  const user = await requireUser({ roles: ["STUDENT"] });

  await syncCompletedSessions(user.id);

  const [registrations, sessions] = await Promise.all([
    prisma.mealRegistration.findMany({
      where: { studentId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mealSession.findMany({
      where: { studentId: user.id },
      orderBy: { date: "asc" },
      include: { compensatedBy: { select: { id: true } } },
    }),
  ]);

  const patternById = new Map(registrations.map((r) => [r.id, r.mealPattern]));

  return (
    <AppShell role={user.role} name={user.name}>
      <StudentDashboard
        studentName={user.name}
        orderCode={user.orderCode}
        major={user.major}
        className={user.className}
        sessions={sessions.map((s) => ({
          id: s.id,
          date: s.date.toISOString(),
          mealType: s.mealType,
          status: s.status,
          pickedUp: s.pickedUp,
          note: s.note,
          price: s.price,
          isCompensation: s.compensationForId != null,
          // A cancelled session can only be restored if something still points back to it as its
          // make-up slot — staff corrections (record-missed-session, remove-session) leave none.
          hasCompensation: s.compensatedBy != null,
          mealPattern: patternById.get(s.registrationId) ?? "BOTH",
        }))}
      />
    </AppShell>
  );
}
