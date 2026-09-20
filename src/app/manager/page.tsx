import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import SalesTools from "@/components/SalesTools";

export default async function ManagerPage() {
  const user = await requireUser({ roles: ["MANAGER", "ADMIN"] });

  return (
    <AppShell role={user.role} name={user.name}>
      <SalesTools canResetAll />
    </AppShell>
  );
}
