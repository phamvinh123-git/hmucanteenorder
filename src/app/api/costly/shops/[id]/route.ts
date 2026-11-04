import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireCostlySession } from "@/lib/costly";
import { logActivity } from "@/lib/log";

// Deleting a shop deletes its whole notebook, so only admins may do it, and one shop always stays.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireCostlySession();
  if (error) return error;
  if (session.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const shop = await prisma.costShop.findUnique({ where: { id }, select: { name: true } });
  if (!shop) return NextResponse.json({ error: "unknown shop" }, { status: 404 });
  if ((await prisma.costShop.count()) <= 1) {
    return NextResponse.json({ error: "Phải còn ít nhất một cơ sở" }, { status: 400 });
  }
  await prisma.costShop.delete({ where: { id } });
  await logActivity(session.userId, "COSTLY_SHOP_DELETE", `Giá vốn: xóa cơ sở "${shop.name}"`);
  return NextResponse.json({ ok: true });
}
