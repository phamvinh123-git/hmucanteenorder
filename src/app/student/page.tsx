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

  // Can a cancelled meal be taken back? Only while the make-up meal given for it (or, when that was cancelled
  // too, the last one of the chain) is still to come. Staff-removed make-ups can only be undone by staff.
  const byId = new Map(sessions.map((x) => [x.id, x]));
  const isRemoval = (note: string | null) => !!note && /^(Xóa thủ công|Giảm gói|Tự động bớt)/.test(note);
  function compensationState(first: (typeof sessions)[number]): "ok" | "used" | "removed" | null {
    if (!first.compensatedBy) return null;
    let c = byId.get(first.compensatedBy.id);
    for (let hops = 0; c && hops < 50; hops++) {
      if (c.status === "SCHEDULED" && !c.pickedUp) return "ok";
      if (c.status !== "CANCELLED") return "used";
      if (isRemoval(c.note)) return hops === 0 ? "removed" : "used";
      // The chain ends in a cancelled meal: nothing to take back, it is restored by swapping (like no link at all).
      if (!c.compensatedBy) return null;
      c = byId.get(c.compensatedBy.id);
    }
    return "used";
  }

  const patternById = new Map(registrations.map((r) => [r.id, r.mealPattern]));

  return (
    <AppShell roles={user.roles} name={user.name}>
      <StudentDashboard
        studentName={user.name}
        orderCode={user.orderCode}
        major={user.major}
        className={user.className}
        // Meals that staff took out for good (removed, merged, trimmed, swapped) are internal corrections: the
        // student does not see them, or they would look like meals the student cancelled.
        sessions={sessions
          .filter((s) => !(s.status === "CANCELLED" && s.note && /^(Xóa thủ công|Giảm gói|Tự động bớt)/.test(s.note)))
          .map((s) => ({
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
          compensationState: compensationState(s),
          mealPattern: patternById.get(s.registrationId) ?? "BOTH",
        }))}
      />
    </AppShell>
  );
}
