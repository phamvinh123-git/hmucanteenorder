import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageCourts, TIME_RE } from "@/lib/courts";
import { logActivity } from "@/lib/log";

async function requireManager() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  if (!canManageCourts(session.role)) return { error: NextResponse.json({ error: "Chỉ Admin được quản lý sân." }, { status: 403 }) };
  return { session };
}

// Admin: every court (also the stopped ones) with all its slots.
export async function GET() {
  const { error } = await requireManager();
  if (error) return error;
  const courts = await prisma.court.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { slots: { orderBy: { startTime: "asc" } } },
  });
  return NextResponse.json(courts);
}

const slotSchema = z
  .object({ startTime: z.string().regex(TIME_RE, "Giờ không hợp lệ"), endTime: z.string().regex(TIME_RE, "Giờ không hợp lệ") })
  .refine((s) => s.endTime > s.startTime, { message: "Giờ kết thúc phải sau giờ bắt đầu." });

const createSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên sân.").max(80),
  description: z.string().trim().max(200).optional(),
  slots: z.array(slotSchema).max(40).optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireManager();
  if (error) return error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  const { name, description, slots } = parsed.data;
  if (await prisma.court.findUnique({ where: { name }, select: { id: true } })) {
    return NextResponse.json({ error: "Đã có sân tên này." }, { status: 409 });
  }
  if (slots && new Set(slots.map((s) => s.startTime)).size !== slots.length) {
    return NextResponse.json({ error: "Có hai ca trùng giờ bắt đầu." }, { status: 400 });
  }
  const count = await prisma.court.count();
  const court = await prisma.court.create({
    data: { name, description: description || null, sortOrder: count, slots: { create: slots ?? [] } },
    select: { id: true },
  });
  await logActivity(session.userId, "COURT_MANAGE", `Thêm sân "${name}" (${slots?.length ?? 0} ca)`);
  return NextResponse.json(court);
}
