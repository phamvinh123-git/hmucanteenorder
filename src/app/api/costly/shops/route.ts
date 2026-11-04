import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCostlySession } from "@/lib/costly";
import { logActivity } from "@/lib/log";

export async function GET() {
  const { error } = await requireCostlySession();
  if (error) return error;
  const shops = await prisma.costShop.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  return NextResponse.json(shops);
}

const createSchema = z.object({ name: z.string().trim().min(1, "Nhập tên cơ sở").max(80) });

export async function POST(req: NextRequest) {
  const { session, error } = await requireCostlySession();
  if (error) return error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { name } = parsed.data;
  if (await prisma.costShop.findUnique({ where: { name }, select: { id: true } })) {
    return NextResponse.json({ error: "Đã có cơ sở tên này" }, { status: 409 });
  }
  const shop = await prisma.costShop.create({ data: { name }, select: { id: true, name: true } });
  await logActivity(session.userId, "COSTLY_SHOP_ADD", `Giá vốn: thêm cơ sở "${name}"`);
  return NextResponse.json(shop);
}
