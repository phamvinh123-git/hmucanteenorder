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
    }),
  ]);

  return (
    <AppShell role={user.role} name={user.name}>
      <StudentDashboard
        studentName={user.name}
        registrations={registrations.map((r) => ({
          id: r.id,
          startDate: r.startDate.toISOString(),
          totalSessions: r.totalSessions,
          mealPattern: r.mealPattern,
          pricePerMeal: r.pricePerMeal,
          note: r.note,
          createdAt: r.createdAt.toISOString(),
        }))}
        sessions={sessions.map((s) => ({
          id: s.id,
          date: s.date.toISOString(),
          mealType: s.mealType,
          status: s.status,
          note: s.note,
          price: s.price,
        }))}
      />
    </AppShell>
  );
}
