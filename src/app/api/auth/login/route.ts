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

  const login = body.data.phone.trim();
  const { password } = body.data;
  // Officers ("cán bộ") can sign in with either their phone number or their staff code (any case).
  const user =
    (await prisma.user.findUnique({ where: { phone: login } })) ??
    (await prisma.user.findUnique({ where: { staffCode: login.toUpperCase() } }));

  if (!user || !user.active) {
    return NextResponse.json({ error: "Số điện thoại / mã cán bộ hoặc mật khẩu không đúng." }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Số điện thoại / mã cán bộ hoặc mật khẩu không đúng." }, { status: 401 });
  }

  await createSessionCookie({ userId: user.id, role: user.role, name: user.name });
  await logActivity(user.id, "LOGIN", `${user.name} đã đăng nhập`);

  return NextResponse.json({
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  });
}
