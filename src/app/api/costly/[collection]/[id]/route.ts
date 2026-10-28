import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { COSTLY_COLLECTIONS, requireCostlySession } from "@/lib/costly";
import { logActivity } from "@/lib/log";

type Ctx = { params: Promise<{ collection: string; id: string }> };

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireCostlySession();
  if (error) return error;
  const { collection, id } = await params;
  if (!COSTLY_COLLECTIONS.has(collection)) return NextResponse.json({ error: "unknown collection" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid data" }, { status: 400 });
  }
  if (id.length > 200) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  // The id lives in the key, not in the stored data.
  const { id: _ignored, ...data } = body as Record<string, unknown>;
  void _ignored;
  const json = data as Prisma.InputJsonObject;
  const existed = await prisma.costDocument.findUnique({ where: { collection_id: { collection, id } }, select: { id: true } });
  await prisma.costDocument.upsert({
    where: { collection_id: { collection, id } },
    create: { collection, id, data: json },
    update: { data: json },
  });
  // New items are worth a log line; every edit of a number is not.
  if (!existed) await logActivity(session.userId, "COSTLY_ADD", `Giá vốn: thêm ${collection} "${String(data.name ?? id).slice(0, 60)}"`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireCostlySession();
  if (error) return error;
  const { collection, id } = await params;
  if (!COSTLY_COLLECTIONS.has(collection)) return NextResponse.json({ error: "unknown collection" }, { status: 404 });

  const doc = await prisma.costDocument.findUnique({ where: { collection_id: { collection, id } } });
  await prisma.costDocument.deleteMany({ where: { collection, id } });
  if (doc) {
    const name = (doc.data as { name?: string } | null)?.name;
    await logActivity(session.userId, "COSTLY_DELETE", `Giá vốn: xóa ${collection} "${String(name ?? id).slice(0, 60)}"`);
  }
  return NextResponse.json({ ok: true });
}
