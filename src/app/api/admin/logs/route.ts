import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessAdmin, getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { user: { select: { name: true, role: true } } },
  });

  return NextResponse.json({ logs });
}
