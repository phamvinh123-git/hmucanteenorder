import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessAdmin, getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/log";

const schema = z.object({
  name: z.string().min(1),
  phone: z
    .string()
    .min(9)
    .max(15)
    .regex(/^[0-9]+$/, "Số điện thoại chỉ gồm chữ số."),
  password: z.string().min(4),
  role: z.enum(["ADMIN", "MANAGER", "SALES"]),
});

export async function GET() {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      phone: true,
      role: true,
      active: true,
      mustChangePassword: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing) {
    return NextResponse.json({ error: "Số điện thoại đã tồn tại." }, { status: 400 });
  }

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      phone: data.phone,
      passwordHash,
      role: data.role,
      mustChangePassword: true,
    },
  });

  await logActivity(session.userId, "CREATE_USER", `Tạo tài khoản ${data.role} cho ${data.name} (${data.phone})`);

  return NextResponse.json({ id: user.id });
}
