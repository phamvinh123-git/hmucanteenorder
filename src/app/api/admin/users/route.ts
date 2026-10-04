import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessAdmin, getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/log";

const PHONE_RE = /^[0-9]{9,15}$/;

const schema = z
  .object({
    name: z.string().min(1),
    phone: z.string().trim().optional(),
    // Officers ("cán bộ") are identified by a fixed staff code and may also have a phone number.
    staffCode: z.string().trim().optional(),
    password: z.string().min(4),
    role: z.enum(["ADMIN", "MANAGER", "SALES", "OFFICER"]),
  })
  .superRefine((v, ctx) => {
    if (v.role === "OFFICER") {
      if (!v.staffCode || !/^[A-Za-z0-9._-]{3,30}$/.test(v.staffCode)) {
        ctx.addIssue({ code: "custom", path: ["staffCode"], message: "Mã cán bộ gồm 3–30 ký tự chữ, số, dấu chấm, gạch ngang hoặc gạch dưới." });
      }
      if (v.phone && !PHONE_RE.test(v.phone)) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: "Số điện thoại gồm 9–15 chữ số." });
      }
    } else if (!v.phone || !PHONE_RE.test(v.phone)) {
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
      staffCode: true,
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
  // Staff codes are stored in upper case so "cb001" and "CB001" are the same account. An officer
  // without a phone number gets the code as a placeholder until they enter their own.
  const staffCode = data.role === "OFFICER" ? data.staffCode!.toUpperCase() : null;
  const phone = data.role === "OFFICER" ? data.phone || staffCode! : data.phone!;

  // Phone numbers and staff codes both work as logins, so neither may collide with the other.
  const clash = await prisma.user.findFirst({
    where: { OR: [{ phone }, { staffCode: phone }, ...(staffCode ? [{ staffCode }, { phone: staffCode }] : [])] },
  });
  if (clash) {
    return NextResponse.json({ error: "Số điện thoại hoặc mã cán bộ đã tồn tại." }, { status: 400 });
  }

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      phone,
      staffCode,
      passwordHash,
      role: data.role,
      mustChangePassword: true,
    },
  });

  await logActivity(session.userId, "CREATE_USER", `Tạo tài khoản ${data.role} cho ${data.name} (${staffCode ?? phone})`);

  return NextResponse.json({ id: user.id });
}
