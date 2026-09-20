import { NextRequest, NextResponse } from "next/server";
import { canAccessAdmin, getSession } from "@/lib/auth";
import { restoreArchive } from "@/lib/archive";
import { logActivity } from "@/lib/log";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.role)) {
    return NextResponse.json({ error: "Chỉ Admin mới được khôi phục bản lưu trữ." }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "RESTORE") {
    return NextResponse.json({ error: "Thiếu xác nhận. Hãy gõ RESTORE để xác nhận." }, { status: 400 });
  }

  try {
    const result = await restoreArchive(id, { id: session.userId, name: session.name });
    await logActivity(
      session.userId,
      "RESTORE_ARCHIVE",
      `Khôi phục bản lưu trữ "${result.archive.label}": ${result.restored.students} sinh viên, ${result.restored.sessions} buổi ăn${
        result.safetyArchive ? " (dữ liệu hiện tại đã được lưu trữ tự động)" : ""
      }`,
    );
    return NextResponse.json({ ok: true, ...result.restored, safetyArchived: !!result.safetyArchive });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Không thể khôi phục." }, { status: 400 });
  }
}
