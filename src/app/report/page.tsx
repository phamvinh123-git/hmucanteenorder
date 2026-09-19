import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import ReportView from "./ReportView";

export default async function ReportPage() {
  const user = await requireUser({ roles: ["SALES", "MANAGER", "ADMIN"] });

  return (
    <AppShell role={user.role} name={user.name}>
      <ReportView />
    </AppShell>
  );
}
