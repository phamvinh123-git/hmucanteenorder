import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionCookie, verifyPassword } from "@/lib/auth";
import { logActivity } from "@/lib/log";

const schema = z.object({
  phone: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Thiếu số điện thoại / mã cán bộ hoặc mật khẩu." }, { status: 400 });
  }

  // Phone keyboards and autofill often add things the person did not type: spaces or dots inside a number, a
  // "+84" prefix, zero-width characters, a trailing space. Clean the login before looking it up.
  const login = body.data.phone.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, " ").trim();
  const compact = login.replace(/[\s.\-()]/g, "");
  const phoneForm = compact.replace(/^\+?84/, "0");
  const candidates = Array.from(new Set([login, compact, phoneForm]));
  const { password } = body.data;
  // Officers ("cán bộ") can sign in with either their phone number or their staff code (any case).
  let user = null;
  for (const c of candidates) {
    user = (await prisma.user.findUnique({ where: { phone: c } })) ?? (await prisma.user.findUnique({ where: { staffCode: c.toUpperCase() } }));
    if (user) break;
  }

  if (!user || !user.active) {
    await logActivity(
      user?.id ?? null,
      "LOGIN_FAILED",
      user ? `${user.name}: tài khoản đang bị khóa (nhập "${login.slice(0, 30)}")` : `Không có tài khoản nào khớp với "${login.slice(0, 30)}"`,
    );
    return NextResponse.json({ error: "Số điện thoại / mã cán bộ hoặc mật khẩu không đúng." }, { status: 401 });
  }

  // The password is checked as typed first. If it does not match and has spaces at either end (a phone keyboard
  // adding one after a word is the usual cause), the trimmed text is tried too.
  const valid =
    (await verifyPassword(password, user.passwordHash)) ||
    (password !== password.trim() && (await verifyPassword(password.trim(), user.passwordHash)));
  if (!valid) {
    await logActivity(user.id, "LOGIN_FAILED", `${user.name}: sai mật khẩu (nhập "${login.slice(0, 30)}")`);
    return NextResponse.json({ error: "Số điện thoại / mã cán bộ hoặc mật khẩu không đúng." }, { status: 401 });
  }

  await createSessionCookie({ userId: user.id, role: user.role, name: user.name });
  await logActivity(user.id, "LOGIN", `${user.name} đã đăng nhập`);

  return NextResponse.json({
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
}
