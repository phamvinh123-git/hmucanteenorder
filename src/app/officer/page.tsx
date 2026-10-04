import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { syncCompletedSessions } from "@/lib/meal-logic";
import AppShell from "@/components/AppShell";
import OfficerDashboard from "./OfficerDashboard";

export default async function OfficerPage() {
  const user = await requireUser({ roles: ["OFFICER"] });

  await syncCompletedSessions(user.id);

  const sessions = await prisma.mealSession.findMany({
    where: { studentId: user.id, mealType: "LUNCH" },
    orderBy: { date: "asc" },
  });

  return (
    <AppShell role={user.role} name={user.name}>
      <OfficerDashboard
        sessions={sessions.map((s) => ({
          id: s.id,
          date: s.date.toISOString(),
          status: s.status,
          pickedUp: s.pickedUp,
        }))}
      />
    </AppShell>
  );
}
