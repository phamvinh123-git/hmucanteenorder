import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessAdmin, getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const archives = await prisma.studentArchive.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, createdByName: true, studentCount: true, sessionCount: true },
  });

  return NextResponse.json({ archives });
}
