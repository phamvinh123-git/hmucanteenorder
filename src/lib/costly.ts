import { NextResponse } from "next/server";
import { canAccessStats, getSession } from "@/lib/auth";

/** The three kinds of document the Cost Ly notebook keeps. */
export const COSTLY_COLLECTIONS = new Set(["ingredients", "batches", "recipes"]);

/** Cost Ly ("Giá vốn") is for managers and admins, with the canteen's own login. */
export async function requireCostlySession() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (!canAccessStats(session.role)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}
