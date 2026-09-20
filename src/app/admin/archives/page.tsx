import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import ArchivesView from "./ArchivesView";

export default async function ArchivesPage() {
  const user = await requireUser({ roles: ["ADMIN"] });

  return (
    <AppShell role={user.role} name={user.name}>
      <ArchivesView />
    </AppShell>
  );
}
