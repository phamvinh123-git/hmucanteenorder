import { NextResponse } from "next/server";
import { requireCostlySession } from "@/lib/costly";

// The Cost Ly page asks who is signed in. Admins may also delete a whole shop (cơ sở).
export async function GET() {
  const { session, error } = await requireCostlySession();
  if (error) return error;
  return NextResponse.json({ username: session.name, role: "owner", canDeleteShop: session.role === "ADMIN" });
}
