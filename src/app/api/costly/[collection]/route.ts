import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { COSTLY_COLLECTIONS, requireCostlySession, requireCostlyShop } from "@/lib/costly";

export async function GET(req: NextRequest, { params }: { params: Promise<{ collection: string }> }) {
  const { error } = await requireCostlySession();
  if (error) return error;
  const { collection } = await params;
  if (!COSTLY_COLLECTIONS.has(collection)) return NextResponse.json({ error: "unknown collection" }, { status: 404 });

  const { shopId, error: shopError } = await requireCostlyShop(req);
  if (shopError) return shopError;

  const rows = await prisma.costDocument.findMany({ where: { shopId, collection }, orderBy: { id: "asc" } });
  // Each document comes back as { id, ...data }, the shape the Cost Ly page expects.
  return NextResponse.json(rows.map((r) => ({ id: r.id, ...(r.data as Record<string, unknown>) })));
}
