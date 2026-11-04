import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAccessStats, getSession } from "@/lib/auth";
import { registerOfficerLunchesFor } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";

const schema = z.object({
  officerIds: z.array(z.string().min(1)).min(1, "Hãy chọn ít nhất một cán bộ.").max(60),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const parse = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

// Manager/admin: registers officers' lunches (Monday to Friday) for them over a range of days, without the weekly
// deadline. See registerOfficerLunchesFor.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Chỉ Quản lý hoặc Admin mới được đăng ký cơm hộ cán bộ." }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const { officerIds, from, to } = parsed.data;

  const results: { name: string; added: number; revived: number; past: number; existing: number; error?: string }[] = [];
  for (const officerId of officerIds) {
    try {
      const r = await registerOfficerLunchesFor({ officerId, from: parse(from), to: parse(to), actorId: session.userId });
      results.push({
        name: r.name,
        added: r.added,
        revived: r.revived,
        past: r.skipped.filter((s) => s.reason === "đã qua").length,
        existing: r.skipped.filter((s) => s.reason === "đã có").length,
      });
      await logActivity(
        session.userId,
        "OFFICER_REGISTER_FOR",
        `Đăng ký cơm trưa hộ cán bộ ${r.name} từ ${from} đến ${to}: thêm ${r.added}, bật lại ${r.revived}, bỏ qua ${r.skipped.length} ngày (${r.skipped.filter((s) => s.reason === "đã qua").length} đã qua, ${r.skipped.filter((s) => s.reason === "đã có").length} đã có sẵn)`,
      );
    } catch (err) {
      results.push({ name: officerId, added: 0, revived: 0, past: 0, existing: 0, error: err instanceof Error ? err.message : "Không đăng ký được." });
    }
  }
  return NextResponse.json({ ok: results.every((r) => !r.error), results });
}
