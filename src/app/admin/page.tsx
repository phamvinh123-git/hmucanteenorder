import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import { comingSoonFor, servicesFor } from "@/lib/services";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import AdminUsers from "./AdminUsers";

export default async function AdminPage() {
  const user = await requireUser({ roles: ["ADMIN"] });

  // What each role opens, worked out from the real rules (not a copy), for the permission table.
  const matrix = [...ASSIGNABLE_ROLES, "STUDENT" as const].map((role) => ({
    role,
    services: [...servicesFor([role]).map((s) => s.key), ...comingSoonFor([role]).map((s) => s.key)],
  }));

  return (
    <AppShell roles={user.roles} name={user.name}>
      <AdminUsers matrix={matrix} />
    </AppShell>
  );
}
