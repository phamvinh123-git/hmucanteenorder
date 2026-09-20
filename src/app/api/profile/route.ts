import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSessionCookie, getSession } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import { isMajor, isValidClassFor } from "@/lib/student-info";

const select = { name: true, phone: true, role: true, orderCode: true, major: true, className: true } as const;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select });
  if (!user) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });
  return NextResponse.json(user);
}

// Phone is the login name, so it is deliberately not editable here.
const patchSchema = z.object({
  name: z.string().trim().min(1, "Họ tên không được để trống.").max(100, "Họ tên quá dài.").optional(),
  major: z.union([z.string(), z.null()]).optional(),
  className: z.union([z.string(), z.null()]).optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const body = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });

  const data: { name?: string; major?: string | null; className?: string | null } = {};
  if (body.name !== undefined) data.name = body.name;

  if ("major" in body || "className" in body) {
    if (user.role !== "STUDENT") {
      return NextResponse.json({ error: "Chỉ sinh viên mới có ngành và lớp." }, { status: 400 });
    }
    const major = "major" in body ? body.major || null : user.major;
    if (major && !isMajor(major)) {
      return NextResponse.json({ error: "Ngành không hợp lệ." }, { status: 400 });
    }
    let className = "className" in body ? body.className || null : user.className;
    if (className && !isValidClassFor(major, className)) {
      if ("className" in body) {
        return NextResponse.json(
          { error: major ? "Lớp không hợp lệ với ngành đã chọn." : "Hãy chọn ngành trước khi chọn lớp." },
          { status: 400 },
        );
      }
      className = null;
    }
    data.major = major;
    data.className = className;
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data, select });
  await logActivity(user.id, "UPDATE_PROFILE", `${user.name} cập nhật hồ sơ cá nhân`);

  // Keep the name stored in the session cookie in step with the profile.
  if (data.name) await createSessionCookie({ userId: user.id, role: user.role, name: data.name });

  return NextResponse.json({ ok: true, ...updated });
}
