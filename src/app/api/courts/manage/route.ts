import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAssignCourtManagers, canManageCourt, canManageCourts, TIME_RE } from "@/lib/courts";
import { logActivity } from "@/lib/log";

async function requireStaff() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 }) };
  if (!canManageCourts(session.role)) return { error: NextResponse.json({ error: "Không có quyền quản lý sân." }, { status: 403 }) };
  return { session };
}

// The courts this person manages (also the stopped ones) with all their slots. Admin and the head of the service
// team also get the people who can be chosen as a court's manager.
export async function GET() {
  const { session, error } = await requireStaff();
  if (error) return error;
  const courts = await prisma.court.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { slots: { orderBy: { startTime: "asc" } }, manager: { select: { id: true, name: true } } },
  });
  const assign = canAssignCourtManagers(session.role);
  const managers = assign
    ? await prisma.user.findMany({ where: { role: "COURT_MANAGER", active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  return NextResponse.json({ courts: courts.filter((c) => canManageCourt(session, c)), managers, canAssign: assign });
}

const slotSchema = z
  .object({ startTime: z.string().regex(TIME_RE, "Giờ không hợp lệ"), endTime: z.string().regex(TIME_RE, "Giờ không hợp lệ") })
  .refine((s) => s.endTime > s.startTime, { message: "Giờ kết thúc phải sau giờ bắt đầu." });

const createSchema = z.object({
  name: z.string().trim().min(1, "Nhập tên sân.").max(80),
  description: z.string().trim().max(200).optional(),
  managerId: z.string().nullable().optional(),
  slots: z.array(slotSchema).max(40).optional(),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireStaff();
  if (error) return error;
  // Only the student union, admin and the head of the service team add courts.
  if (session.role === "COURT_MANAGER") return NextResponse.json({ error: "Quản lý sân không tự thêm sân." }, { status: 403 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  const { name, description, slots, managerId } = parsed.data;
  if (managerId && !canAssignCourtManagers(session.role)) {
    return NextResponse.json({ error: "Chỉ Admin hoặc Tổ trưởng chọn được người quản lý sân." }, { status: 403 });
  }
  if (managerId && !(await prisma.user.findFirst({ where: { id: managerId, role: "COURT_MANAGER", active: true }, select: { id: true } }))) {
    return NextResponse.json({ error: "Người quản lý sân không hợp lệ." }, { status: 400 });
  }
  if (await prisma.court.findUnique({ where: { name }, select: { id: true } })) {
    return NextResponse.json({ error: "Đã có sân tên này." }, { status: 409 });
  }
  if (slots && new Set(slots.map((s) => s.startTime)).size !== slots.length) {
    return NextResponse.json({ error: "Có hai ca trùng giờ bắt đầu." }, { status: 400 });
  }
  const count = await prisma.court.count();
  const court = await prisma.court.create({
    data: { name, description: description || null, managerId: managerId || null, sortOrder: count, slots: { create: slots ?? [] } },
    select: { id: true },
  });
  await logActivity(session.userId, "COURT_MANAGE", `Thêm sân "${name}" (${slots?.length ?? 0} ca)`);
  return NextResponse.json(court);
}
