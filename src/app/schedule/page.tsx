import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import ScheduleView from "./ScheduleView";

export default async function SchedulePage() {
  const user = await requireUser({ roles: ["SALES", "MANAGER", "ADMIN"] });

  return (
    <AppShell role={user.role} name={user.name}>
      <ScheduleView />
    </AppShell>
  );
}
