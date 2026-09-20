import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, getSession } from "@/lib/auth";

// Used by the registration form: an existing phone number returns the stored student info.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const phone = req.nextUrl.searchParams.get("phone")?.trim() ?? "";
  if (!/^[0-9]{9,15}$/.test(phone)) return NextResponse.json({ found: false });

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return NextResponse.json({ found: false });
  if (user.role !== "STUDENT") return NextResponse.json({ found: false, notStudent: true });

  const remaining = await prisma.mealSession.count({ where: { studentId: user.id, status: "SCHEDULED" } });
  return NextResponse.json({
    found: true,
    name: user.name,
    major: user.major,
    className: user.className,
    orderCode: user.orderCode,
    remaining,
  });
}
