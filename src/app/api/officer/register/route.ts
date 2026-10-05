import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveOfficerWeek } from "@/lib/meal-logic";
import { parseLocalDate } from "@/lib/officer-rules";
import { logActivity } from "@/lib/log";

const schema = z.object({
  weekStart: z.string(),
  dates: z.array(z.string()).max(7),
});

// An officer ("cán bộ") sets which weekdays of a coming week they want lunch. The rules
// (lunch only, Mon-Fri, deadline = end of the Friday before the week) are enforced in saveOfficerWeek.
export async function POST(req: NextRequest) {
  const session = await getSession();
  const officer = session ? await prisma.user.findUnique({ where: { id: session.userId }, select: { isOfficer: true, active: true } }) : null;
  if (!session || !officer?.isOfficer || !officer.active) {
    return NextResponse.json({ error: "Chỉ tài khoản cán bộ mới đăng ký cơm theo tuần." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const weekMonday = parseLocalDate(parsed.data.weekStart);
  const days = parsed.data.dates.map(parseLocalDate);
  if (!weekMonday || days.some((d) => d === null)) {
    return NextResponse.json({ error: "Ngày không hợp lệ." }, { status: 400 });
  }

  try {
    const result = await saveOfficerWeek({
      officerId: session.userId,
      weekMonday,
      days: days as Date[],
    });
    await logActivity(
      session.userId,
      "OFFICER_SAVE_WEEK",
      `${session.name} đăng ký cơm trưa tuần ${parsed.data.weekStart}: ${result.total} ngày (thêm ${result.added}, bỏ ${result.removed}, bật lại ${result.revived})`,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Không thể lưu đăng ký.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
