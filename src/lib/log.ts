import { prisma } from "@/lib/db";

export async function logActivity(userId: string | null, action: string, detail?: string) {
  await prisma.activityLog.create({
    data: { userId: userId ?? undefined, action, detail },
  });
}
