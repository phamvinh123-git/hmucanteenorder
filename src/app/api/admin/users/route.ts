import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessAdmin, getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/log";

const schema = z.object({
  name: z.string().min(1),
  // Phone number for most accounts; a staff code for officers (see superRefine below).
  phone: z.string().trim().min(1, "Vui lòng nhập tên đăng nhập."),
  password: z.string().min(4),
  role: z.enum(["ADMIN", "MANAGER", "SALES", "OFFICER"]),
}).superRefine((v, ctx) => {
  if (v.role === "OFFICER") {
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(v.phone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Mã cán bộ gồm 3–30 ký tự chữ, số, dấu chấm, gạch ngang hoặc gạch dưới." });
    }
  } else if (!/^[0-9]{9,15}$/.test(v.phone)) {
    ctx.addIssue({ code: "custom", path: ["phone"], message: "Số điện thoại gồm 9–15 chữ số." });
  }
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
  // Staff codes are stored in upper case so "cb001" and "CB001" are the same account.
  if (data.role === "OFFICER") data.phone = data.phone.toUpperCase();

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
