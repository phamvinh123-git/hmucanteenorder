import { requireUser } from "@/lib/guard";
import { canAccessStats } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import SalesTools from "@/components/SalesTools";

export default async function SalesPage() {
  const user = await requireUser({ roles: ["SALES", "MANAGER", "ADMIN", "SERVICE_HEAD"] });

  return (
    <AppShell roles={user.roles} name={user.name}>
      <SalesTools canResetAll={canAccessStats(user.roles)} />
    </AppShell>
  );
}
