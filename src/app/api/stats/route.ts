import { NextRequest, NextResponse } from "next/server";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
} from "date-fns";
import { prisma } from "@/lib/db";
import { canAccessStats, getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessStats(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const range = req.nextUrl.searchParams.get("range") ?? "week";
  const dateParam = req.nextUrl.searchParams.get("date");
  const refDate = dateParam ? new Date(dateParam) : new Date();

  let start: Date;
  let end: Date;
  if (range === "custom") {
    const startParam = req.nextUrl.searchParams.get("start");
    const endParam = req.nextUrl.searchParams.get("end");
    if (!startParam || !endParam) {
      return NextResponse.json({ error: "Thiếu ngày bắt đầu hoặc kết thúc." }, { status: 400 });
    }
    const rawStart = startOfDay(new Date(startParam));
    const rawEnd = endOfDay(new Date(endParam));
    if (Number.isNaN(rawStart.getTime()) || Number.isNaN(rawEnd.getTime())) {
      return NextResponse.json({ error: "Ngày không hợp lệ." }, { status: 400 });
    }
    if (rawEnd < rawStart) {
      return NextResponse.json({ error: "Ngày kết thúc phải sau ngày bắt đầu." }, { status: 400 });
    }
    if (rawEnd.getTime() - rawStart.getTime() > 366 * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ error: "Khoảng ngày tối đa là 366 ngày." }, { status: 400 });
    }
    start = rawStart;
    end = rawEnd;
  } else if (range === "day") {
    start = startOfDay(refDate);
    end = endOfDay(refDate);
  } else if (range === "month") {
    start = startOfMonth(refDate);
    end = endOfMonth(refDate);
  } else {
    start = startOfWeek(refDate, { weekStartsOn: 1 });
    end = endOfWeek(refDate, { weekStartsOn: 1 });
  }

  const sessions = await prisma.mealSession.findMany({
    where: {
      date: { gte: start, lte: end },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    select: { date: true, mealType: true, price: true, status: true },
  });

  const days = eachDayOfInterval({ start, end });
  const buckets = new Map<string, { date: string; lunch: number; dinner: number; revenue: number }>();
  for (const d of days) {
    const key = format(d, "yyyy-MM-dd");
    buckets.set(key, { date: key, lunch: 0, dinner: 0, revenue: 0 });
  }

  for (const s of sessions) {
    const key = format(s.date, "yyyy-MM-dd");
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (s.mealType === "LUNCH") bucket.lunch += 1;
    else bucket.dinner += 1;
    bucket.revenue += s.price;
  }

  const series = Array.from(buckets.values());
  const summary = series.reduce(
    (acc, b) => {
      acc.totalMeals += b.lunch + b.dinner;
      acc.lunchMeals += b.lunch;
      acc.dinnerMeals += b.dinner;
      acc.totalRevenue += b.revenue;
      return acc;
    },
    { totalMeals: 0, lunchMeals: 0, dinnerMeals: 0, totalRevenue: 0 },
  );

  return NextResponse.json({
    range,
    start: start.toISOString(),
    end: end.toISOString(),
    series,
    summary,
  });
}
