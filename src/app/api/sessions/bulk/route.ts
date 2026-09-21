import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cancelSessionAndExtend, restoreSession } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

const schema = z.object({
  action: z.enum(["cancel", "restore"]),
  ids: z.array(z.string().min(1)).min(1, "Hãy chọn ít nhất 1 buổi.").max(100),
});

// Cancel or restore several meals in one request. Each meal follows the exact same rules as the
// single-meal endpoints; meals that fail (e.g. past the cutoff) are reported and the rest still go through.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const { action, ids } = parsed.data;

  const isAdmin = session.role === "ADMIN";
  const targets = await prisma.mealSession.findMany({ where: { id: { in: ids } } });
  if (targets.length !== new Set(ids).size) {
    return NextResponse.json({ error: "Có buổi ăn không tồn tại." }, { status: 404 });
  }
  if (!targets.every((t) => isAdmin || (t.studentId === session.userId && session.role === "STUDENT"))) {
    return NextResponse.json({ error: "Không có quyền thao tác các buổi ăn này." }, { status: 403 });
  }

  // Cancel earliest first so the appended make-up meals follow the same order.
  const ordered = [...targets].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || (a.mealType === "LUNCH" ? -1 : 1),
  );

  const done: { id: string; newSession?: unknown; removedCompensationId?: string }[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const t of ordered) {
    try {
      if (action === "cancel") {
        const r = await cancelSessionAndExtend(t.id, { bypassDeadline: isAdmin });
        done.push({ id: t.id, newSession: r.newSession });
      } else {
        const r = await restoreSession(t.id, { bypassDeadline: isAdmin });
        done.push({ id: t.id, removedCompensationId: r.removedCompensationId });
      }
    } catch (err) {
      failed.push({ id: t.id, error: err instanceof Error ? err.message : "Không thể thực hiện." });
    }
  }

  if (done.length > 0) {
    const verb = action === "cancel" ? "Hủy" : "Khôi phục";
    const tail = failed.length ? `, ${failed.length} buổi không thực hiện được` : "";
    await logActivity(
      session.userId,
      action === "cancel" ? "CANCEL_SESSIONS_BULK" : "RESTORE_SESSIONS_BULK",
      `${verb} ${done.length} buổi ăn cùng lúc${tail}`,
    );
  }

  return NextResponse.json({ ok: failed.length === 0, done, failed });
}
