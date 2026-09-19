import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import AdminUsers from "./AdminUsers";

export default async function AdminPage() {
  const user = await requireUser({ roles: ["ADMIN"] });

  return (
    <AppShell role={user.role} name={user.name}>
      <AdminUsers />
    </AppShell>
  );
}
