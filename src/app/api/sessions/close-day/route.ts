import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAccessStats, getSession } from "@/lib/auth";
import { closeMealDay } from "@/lib/meal-logic";
import { parseDayKey } from "@/lib/courts";
import { localDateKey } from "@/lib/client-session-rules";
import { logActivity } from "@/lib/log";

const schema = z.object({
  date: z.string(),
  apply: z.boolean().default(false),
  reason: z.string().trim().max(100).optional(),
});

// The school is closed on a day (a public holiday): cancel every meal booked that day. Students get a make-up meal each,
// officers just lose the lunch. With apply=false it only counts what would change. Quản lý căng tin, Tổ trưởng and Admin only.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessStats(session.roles)) {
    return NextResponse.json({ error: "Chỉ Quản lý căng tin, Tổ trưởng hoặc Admin mới được hủy cơm cả ngày." }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const day = parseDayKey(parsed.data.date);
  if (!day) return NextResponse.json({ error: "Ngày không hợp lệ." }, { status: 400 });
  if (localDateKey(day) < localDateKey(new Date())) {
    return NextResponse.json({ error: "Ngày đã qua, không hủy cơm được nữa." }, { status: 400 });
  }

  const result = await closeMealDay({ day, apply: parsed.data.apply });
  if (result.applied) {
    const tail = result.failed.length ? `, ${result.failed.length} buổi không hủy được` : "";
    await logActivity(
      session.userId,
      "CLOSE_MEAL_DAY",
      `Hủy cơm ngày ${result.day.split("-").reverse().join("/")}${parsed.data.reason ? ` (${parsed.data.reason})` : ""}: ${result.cancelledStudent} buổi của sinh viên (bù ${result.makeups} buổi), ${result.cancelledOfficer} buổi của cán bộ${tail}`,
    );
  }
  return NextResponse.json(result);
}
