import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { logActivity } from "@/lib/log";

export async function POST() {
  const session = await getSession();
  if (session) {
    await logActivity(session.userId, "LOGOUT", `${session.name} đã đăng xuất`);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
