import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessSalesTools, DEFAULT_STUDENT_PASSWORD, getSession, hashPassword } from "@/lib/auth";
import { createRegistrationWithSessions, LOW_MEAL_THRESHOLD, nextOrderCode, syncCompletedSessions } from "@/lib/meal-logic";
import { logActivity } from "@/lib/log";
import { isMajor, isValidClassFor } from "@/lib/student-info";

const schema = z.object({
  name: z.string().min(1, "Vui lòng nhập tên sinh viên."),
  phone: z
    .string()
    .min(9, "Số điện thoại không hợp lệ.")
    .max(15, "Số điện thoại không hợp lệ.")
    .regex(/^[0-9]+$/, "Số điện thoại chỉ gồm chữ số."),
  startDate: z.string().min(1),
  totalSessions: z.coerce.number().int().min(1).max(200),
  mealPattern: z.enum(["LUNCH", "DINNER", "BOTH"]),
  pricePerMeal: z.coerce.number().int().min(0),
  note: z.string().optional(),
  major: z.string().optional(),
  className: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const data = parsed.data;

  const major = data.major || null;
  const className = data.className || null;
  if (major && !isMajor(major)) {
    return NextResponse.json({ error: "Ngành không hợp lệ." }, { status: 400 });
  }
  if (className && !isValidClassFor(major, className)) {
    return NextResponse.json(
      { error: major ? "Lớp không hợp lệ với ngành đã chọn." : "Hãy chọn ngành trước khi chọn lớp." },
      { status: 400 },
    );
  }

  const existing = await prisma.user.findUnique({ where: { phone: data.phone } });
  if (existing && existing.role !== "STUDENT") {
    return NextResponse.json({ error: "Số điện thoại này đã được dùng cho một tài khoản không phải sinh viên." }, { status: 400 });
  }

  let student = existing;
  if (!student) {
    const passwordHash = await hashPassword(DEFAULT_STUDENT_PASSWORD);
    // Retry once on a rare order-code race between two concurrent creations.
    for (let attempt = 0; attempt < 2 && !student; attempt++) {
      const orderCode = await nextOrderCode();
      try {
        student = await prisma.user.create({
          data: {
            phone: data.phone,
            name: data.name,
            passwordHash,
            role: "STUDENT",
            mustChangePassword: true,
            orderCode,
            major,
            className,
          },
        });
      } catch (err) {
        if (attempt === 1) throw err;
      }
    }
    if (!student) {
      throw new Error("Không thể tạo tài khoản sinh viên.");
    }
    await logActivity(
      session.userId,
      "CREATE_STUDENT_ACCOUNT",
      `Tạo tài khoản sinh viên ${data.name} (${data.phone}) với mật khẩu mặc định, mã số ${student.orderCode}`,
    );
  }

  const registration = await createRegistrationWithSessions({
    studentId: student.id,
    startDate: new Date(data.startDate),
    totalSessions: data.totalSessions,
    mealPattern: data.mealPattern,
    pricePerMeal: data.pricePerMeal,
    note: data.note,
    createdById: session.userId,
  });

  await logActivity(
    session.userId,
    "CREATE_REGISTRATION",
    `Đăng ký ${data.totalSessions} suất ăn (${data.mealPattern}) cho ${data.name} (${data.phone}) từ ${data.startDate}`,
  );

  return NextResponse.json({ studentId: student.id, registrationId: registration.id });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canAccessSalesTools(session.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }

  const search = req.nextUrl.searchParams.get("q")?.trim();

  const students = await prisma.user.findMany({
    where: {
      role: "STUDENT",
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      registrations: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  await syncCompletedSessions();

  const withCounts = await Promise.all(
    students.map(async (s) => {
      const remaining = await prisma.mealSession.count({
        where: { studentId: s.id, status: "SCHEDULED" },
      });
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        orderCode: s.orderCode,
        major: s.major,
        className: s.className,
        mustChangePassword: s.mustChangePassword,
        active: s.active,
        latestRegistration: s.registrations[0] ?? null,
        remaining,
        lowMeal: remaining < LOW_MEAL_THRESHOLD,
      };
    }),
  );

  // Order code ascending (nulls last), then most recently added first.
  withCounts.sort((a, b) => {
    if (a.orderCode != null && b.orderCode != null) return a.orderCode - b.orderCode;
    if (a.orderCode != null) return -1;
    if (b.orderCode != null) return 1;
    return 0;
  });

  return NextResponse.json({ students: withCounts });
}
