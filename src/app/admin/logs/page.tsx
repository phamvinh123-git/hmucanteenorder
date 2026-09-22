import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import LogsView from "./LogsView";

const LOG_LIMIT = 1000;

export default async function LogsPage() {
  const user = await requireUser({ roles: ["ADMIN"] });

  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: LOG_LIMIT,
    include: { user: { select: { name: true } } },
  });

  return (
    <AppShell role={user.role} name={user.name}>
      <LogsView
        limit={LOG_LIMIT}
        logs={logs.map((log) => ({
          id: log.id,
          action: log.action,
          detail: log.detail,
          createdAt: log.createdAt.toISOString(),
          userName: log.user?.name ?? "Hệ thống",
        }))}
      />
    </AppShell>
  );
}
