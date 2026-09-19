import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import StatsView from "./StatsView";

export default async function StatsPage() {
  const user = await requireUser({ roles: ["MANAGER", "ADMIN"] });

  return (
    <AppShell role={user.role} name={user.name}>
      <StatsView />
    </AppShell>
  );
}
