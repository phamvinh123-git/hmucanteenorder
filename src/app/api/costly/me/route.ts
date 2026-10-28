import { NextResponse } from "next/server";
import { requireCostlySession } from "@/lib/costly";

// The Cost Ly page asks who is signed in. It is one shared notebook, so everyone is the "owner" of it.
export async function GET() {
  const { session, error } = await requireCostlySession();
  if (error) return error;
  return NextResponse.json({ username: session.name, role: "owner" });
}
