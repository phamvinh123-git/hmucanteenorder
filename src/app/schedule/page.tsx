import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import ScheduleView from "./ScheduleView";

export default async function SchedulePage() {
  const user = await requireUser({ roles: ["SALES", "MANAGER", "ADMIN", "SERVICE_HEAD"] });

  return (
    <AppShell roles={user.roles} name={user.name}>
      <ScheduleView />
    </AppShell>
  );
}
