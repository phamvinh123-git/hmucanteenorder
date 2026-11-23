import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import SalesTools from "@/components/SalesTools";

export default async function ManagerPage() {
  const user = await requireUser({ roles: ["MANAGER", "ADMIN", "SERVICE_HEAD"] });

  return (
    <AppShell roles={user.roles} name={user.name}>
      <SalesTools canResetAll />
    </AppShell>
  );
}
