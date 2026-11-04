import { NextRequest, NextResponse } from "next/server";
import { canAccessCostly, getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** The three kinds of document the Cost Ly notebook keeps. */
export const COSTLY_COLLECTIONS = new Set(["ingredients", "batches", "recipes"]);

/** Cost Ly ("Giá vốn") is for admins and the canteen-support staff, with the canteen's own login. */
export async function requireCostlySession() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (!canAccessCostly(session.role)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}

/** The shop (cơ sở) a data call is for: the page sends it as ?tenant=<shop id>. */
export async function requireCostlyShop(req: NextRequest) {
  const shopId = req.nextUrl.searchParams.get("tenant");
  if (!shopId) return { error: NextResponse.json({ error: "shop required" }, { status: 400 }) };
  const shop = await prisma.costShop.findUnique({ where: { id: shopId }, select: { id: true } });
  if (!shop) return { error: NextResponse.json({ error: "unknown shop" }, { status: 404 }) };
  return { shopId: shop.id };
}
