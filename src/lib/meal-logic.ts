import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { MealPattern, MealType } from "@prisma/client";
import {
  canBookSlot,
  canCancelSession,
  canRestoreSession,
  compareSlots,
  generateSessionPlan,
  nextSlot,
} from "@/lib/session-rules";
import { localDateKey } from "@/lib/client-session-rules";
import { OFFICER_MEAL_PRICE, officerWeekDays, openWeekMondays, registrationDeadline } from "@/lib/officer-rules";

export {
  LUNCH_CUTOFF_HOUR,
  DINNER_CUTOFF_HOUR,
  LOW_MEAL_THRESHOLD,
  canCancelSession,
  canRestoreSession,
  cancelCutoff,
} from "@/lib/session-rules";

/** Creates a registration plus its initial set of scheduled meal sessions. */
export async function createRegistrationWithSessions(params: {
  studentId: string;
  startDate: Date;
  totalSessions: number;
  mealPattern: MealPattern;
  pricePerMeal: number;
  note?: string;
  createdById: string;
  firstMeal?: MealType;
}) {
  const slots = generateSessionPlan(params.startDate, params.mealPattern, params.totalSessions, params.firstMeal);

  return prisma.mealRegistration.create({
    data: {
      studentId: params.studentId,
      startDate: startOfDay(params.startDate),
      totalSessions: params.totalSessions,
      mealPattern: params.mealPattern,
      pricePerMeal: params.pricePerMeal,
      note: params.note,
      createdById: params.createdById,
      sessions: {
        create: slots.map((s) => ({
          studentId: params.studentId,
          date: s.date,
          mealType: s.mealType,
          price: params.pricePerMeal,
        })),
      },
    },
    include: { sessions: true },
  });
}

/** Local hours after which today's lunch / dinner counts as finished. */
const LUNCH_DONE_HOUR = 14;
const DINNER_DONE_HOUR = 20;

/**
 * Marks finished scheduled sessions as completed: anything before today, plus today's
 * lunch after 14:00 and today's dinner after 20:00. Call before reading session data.
 */
export async function syncCompletedSessions(studentId?: string) {
  const now = new Date();
  const today = startOfDay(now);
  const hour = now.getHours();
  await prisma.mealSession.updateMany({
    where: {
      status: "SCHEDULED",
      OR: [
        { date: { lt: today } },
        ...(hour >= LUNCH_DONE_HOUR ? [{ date: today, mealType: "LUNCH" as const }] : []),
        ...(hour >= DINNER_DONE_HOUR ? [{ date: today, mealType: "DINNER" as const }] : []),
      ],
      ...(studentId ? { studentId } : {}),
    },
    data: { status: "COMPLETED" },
  });
}

/**
 * Cancels a session (after deadline validation by the caller) and appends a
 * compensating slot so the student still receives their full purchased count.
 */
export async function cancelSessionAndExtend(sessionId: string, opts: { bypassDeadline?: boolean } = {}) {
  const session = await prisma.mealSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { registration: true },
  });

  if (opts.bypassDeadline) {
    if (session.status !== "SCHEDULED") {
      throw new Error("Buổi ăn này không còn ở trạng thái có thể hủy.");
    }
  } else {
    const check = canCancelSession(session);
    if (!check.ok) {
      throw new Error(check.reason ?? "Không thể hủy buổi ăn này.");
    }
  }

  const allSlots = await prisma.mealSession.findMany({
    where: { registrationId: session.registrationId },
    select: { date: true, mealType: true },
  });

  const lastSlot = [...allSlots].sort(compareSlots).at(-1)!;
  const appended = nextSlot(lastSlot, session.registration.mealPattern);

  const [cancelled, newSession] = await prisma.$transaction([
    prisma.mealSession.update({
      where: { id: sessionId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
    prisma.mealSession.create({
      data: {
        registrationId: session.registrationId,
        studentId: session.studentId,
        date: appended.date,
        mealType: appended.mealType,
        status: "SCHEDULED",
        price: session.registration.pricePerMeal,
        compensationForId: sessionId,
      },
    }),
  ]);

  return { cancelled, newSession };
}

/**
 * Undoes a cancellation: removes the compensating slot that was auto-added
 * at the end of the sequence and puts the original session back to
 * SCHEDULED. Only possible while still within the same cutoff window that
 * would have allowed cancelling it, and only if that compensating slot
 * hasn't itself been touched (cancelled, completed, or picked up) since.
 */
export async function restoreSession(sessionId: string, opts: { bypassDeadline?: boolean } = {}) {
  const session = await prisma.mealSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { compensatedBy: true },
  });

  if (opts.bypassDeadline) {
    if (session.status !== "CANCELLED") {
      throw new Error("Buổi ăn này không ở trạng thái đã hủy.");
    }
  } else {
    const check = canRestoreSession(session);
    if (!check.ok) {
      throw new Error(check.reason ?? "Không thể khôi phục buổi ăn này.");
    }
  }

  const compensation = session.compensatedBy;
  if (!compensation || compensation.status !== "SCHEDULED" || compensation.pickedUp) {
    throw new Error("Suất bù cho lần hủy này đã được dùng, không thể khôi phục.");
  }

  const [restored] = await prisma.$transaction([
    prisma.mealSession.update({
      where: { id: sessionId },
      data: { status: "SCHEDULED", cancelledAt: null },
    }),
    prisma.mealSession.delete({ where: { id: compensation.id } }),
  ]);

  return { restored, removedCompensationId: compensation.id };
}

/**
 * Lets a student pick the day/meal for a compensation session (the one the
 * system appended at the end after a cancellation) instead of keeping the
 * automatic slot. Same cutoff rules as cancelling/booking: the current slot
 * must still be changeable and the new slot must still be bookable.
 */
export async function moveCompensationSession(
  sessionId: string,
  target: { date: Date; mealType: MealType },
  opts: { bypassDeadline?: boolean } = {},
) {
  const session = await prisma.mealSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { registration: true },
  });

  if (session.status !== "SCHEDULED" || session.pickedUp) {
    throw new Error("Buổi ăn này không còn ở trạng thái có thể đổi.");
  }
  if (!session.compensationForId) {
    throw new Error("Chỉ đổi được buổi bù (buổi được thêm sau khi bạn hủy một buổi).");
  }

  const day = startOfDay(target.date);
  if (!opts.bypassDeadline) {
    const current = canCancelSession(session);
    if (!current.ok) throw new Error(current.reason ?? "Không thể đổi buổi ăn này.");
    const next = canBookSlot({ date: day, mealType: target.mealType });
    if (!next.ok) throw new Error(next.reason ?? "Không thể chọn buổi này.");
  }

  const pattern = session.registration.mealPattern;
  if (pattern !== "BOTH" && pattern !== target.mealType) {
    throw new Error(
      pattern === "LUNCH" ? "Gói của bạn chỉ có bữa trưa." : "Gói của bạn chỉ có bữa tối.",
    );
  }

  if (session.date.getTime() === day.getTime() && session.mealType === target.mealType) {
    throw new Error("Đây đang là buổi bù hiện tại của bạn, hãy chọn ngày khác.");
  }

  const clash = await prisma.mealSession.findFirst({
    where: { studentId: session.studentId, date: day, mealType: target.mealType, id: { not: sessionId } },
  });
  if (clash) {
    throw new Error(
      clash.status === "CANCELLED"
        ? "Bạn đã hủy buổi này trước đó, hãy dùng nút Khôi phục thay vì chọn lại."
        : "Bạn đã có buổi ăn vào bữa này rồi.",
    );
  }

  return prisma.mealSession.update({
    where: { id: sessionId },
    data: { date: day, mealType: target.mealType },
  });
}

/** Remaining (not yet consumed, not cancelled) meal count for a student. */
export async function remainingSessionCount(studentId: string) {
  await syncCompletedSessions(studentId);
  return prisma.mealSession.count({
    where: { studentId, status: "SCHEDULED" },
  });
}

/** Next free order code: one past the highest currently assigned to any student. */
export async function nextOrderCode() {
  const top = await prisma.user.findFirst({
    where: { role: "STUDENT", orderCode: { not: null } },
    orderBy: { orderCode: "desc" },
    select: { orderCode: true },
  });
  return (top?.orderCode ?? 0) + 1;
}

/** Clears every student's order code, ready for Sales/Manager to reassign for a new term. */
export async function resetAllOrderCodes() {
  await prisma.user.updateMany({
    where: { role: "STUDENT", orderCode: { not: null } },
    data: { orderCode: null },
  });
}

/**
 * Assigns sequential order codes to any student who doesn't have one yet
 * (e.g. accounts created before this feature existed), oldest account first.
 * Returns how many students were updated.
 */
export async function backfillMissingOrderCodes() {
  const missing = await prisma.user.findMany({
    where: { role: "STUDENT", orderCode: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  let next = await nextOrderCode();
  for (const student of missing) {
    await prisma.user.update({ where: { id: student.id }, data: { orderCode: next } });
    next += 1;
  }

  return missing.length;
}

/**
 * Data-entry fix: staff forgot to register a meal the student already ate (e.g. picked "start
 * from dinner" although lunch that day was already served). Records that meal as eaten today
 * (or an earlier date), and — since the student only paid for `totalSessions` meals — gives up
 * the registration's last still-scheduled slot so the total actually served doesn't grow.
 */
export async function recordMissedSession(params: { registrationId: string; date: Date; mealType: MealType }) {
  const registration = await prisma.mealRegistration.findUniqueOrThrow({ where: { id: params.registrationId } });

  if (registration.mealPattern !== "BOTH" && registration.mealPattern !== params.mealType) {
    throw new Error(registration.mealPattern === "LUNCH" ? "Gói này chỉ có bữa trưa." : "Gói này chỉ có bữa tối.");
  }

  const day = startOfDay(params.date);
  if (day.getTime() > startOfDay(new Date()).getTime()) {
    throw new Error("Chỉ ghi nhận được buổi đã diễn ra (hôm nay hoặc trước đó).");
  }

  const clash = await prisma.mealSession.findFirst({
    where: { studentId: registration.studentId, date: day, mealType: params.mealType, status: { not: "CANCELLED" } },
  });
  if (clash) {
    throw new Error("Sinh viên đã có buổi ăn vào đúng ngày và bữa này rồi.");
  }

  const scheduled = await prisma.mealSession.findMany({
    where: { registrationId: registration.id, status: "SCHEDULED" },
    select: { id: true, date: true, mealType: true },
  });
  const last = scheduled.length > 0 ? [...scheduled].sort(compareSlots).at(-1)! : null;

  const [created] = await prisma.$transaction([
    prisma.mealSession.create({
      data: {
        registrationId: registration.id,
        studentId: registration.studentId,
        date: day,
        mealType: params.mealType,
        status: "COMPLETED",
        pickedUp: true,
        pickedUpAt: new Date(),
        price: registration.pricePerMeal,
        note: "Bổ sung buổi bị bỏ sót khi đăng ký (sinh viên đã ăn nhưng chưa được ghi nhận)",
      },
    }),
    ...(last
      ? [
          prisma.mealSession.update({
            where: { id: last.id },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              note: "Tự động bớt buổi cuối để bù cho buổi bị bỏ sót ở trên",
            },
          }),
        ]
      : []),
  ]);

  return { created, removedFutureSessionId: last?.id ?? null };
}

/**
 * Manager/admin correction: permanently drops one meal — scheduled (not yet used) or already
 * completed/eaten — with no compensation added (unlike the student-facing cancel flow). For
 * fixing an accidental over-count or a wrongly recorded/duplicated meal: e.g. staff registered a
 * make-up meal separately instead of using `recordMissedSession`, or ticked "Đã lấy" by mistake.
 */
export async function removeSession(sessionId: string) {
  const session = await prisma.mealSession.findUniqueOrThrow({ where: { id: sessionId } });

  if (session.status === "CANCELLED") {
    throw new Error("Buổi này đã ở trạng thái hủy, không cần xóa thêm.");
  }

  return prisma.mealSession.update({
    where: { id: sessionId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      note:
        session.status === "COMPLETED" || session.pickedUp
          ? "Xóa thủ công buổi đã ăn để chỉnh lại số buổi/doanh thu bị sai"
          : "Xóa thủ công để chỉnh lại số buổi bị dư",
    },
  });
}

/**
 * Officer ("cán bộ") ordering: saves which weekdays of the week starting `weekMonday` they want
 * lunch. Only allowed until the end of the Friday before that week. Days dropped before the
 * deadline are simply removed (the officer never committed to them); days that were cancelled
 * earlier and are picked again are switched back on.
 */
export async function saveOfficerWeek(params: { officerId: string; weekMonday: Date; days: Date[] }) {
  const now = new Date();
  const monday = startOfDay(params.weekMonday);
  if (monday.getDay() !== 1) throw new Error("Tuần đăng ký không hợp lệ.");
  if (now.getTime() > registrationDeadline(monday).getTime()) {
    throw new Error("Đã hết hạn đăng ký cho tuần này. Cán bộ phải đăng ký trước hết thứ 6 của tuần trước đó.");
  }
  // Only the week(s) currently open can be ordered — not any week further ahead.
  if (!openWeekMondays(now).some((m) => m.getTime() === monday.getTime())) {
    throw new Error("Chưa đến thời gian đăng ký tuần này. Cán bộ chỉ đăng ký trước 1 tuần.");
  }

  const allowed = new Map(officerWeekDays(monday).map((d) => [localDateKey(d), d]));
  const wanted = new Map<string, Date>();
  for (const d of params.days) {
    const key = localDateKey(d);
    const day = allowed.get(key);
    if (!day) throw new Error("Chỉ đăng ký được từ thứ 2 đến thứ 6 của tuần đã chọn.");
    wanted.set(key, day);
  }

  const weekEnd = addDays(monday, 7);
  const { officerId } = params;

  return prisma.$transaction(async (tx) => {
    const inWeek = { studentId: officerId, mealType: "LUNCH" as const, date: { gte: monday, lt: weekEnd } };
    const existing = await tx.mealSession.findMany({ where: inWeek });
    const byKey = new Map(existing.map((s) => [localDateKey(s.date), s]));

    const dropped = existing.filter((s) => s.status === "SCHEDULED" && !wanted.has(localDateKey(s.date)));
    const revived = existing.filter((s) => s.status === "CANCELLED" && wanted.has(localDateKey(s.date)));
    const createDays = [...wanted.entries()].filter(([key]) => !byKey.has(key)).map(([, d]) => d);

    // Adding or dropping a day only works while that day is still bookable (matters for a week that is
    // already under way, such as the launch week); afterwards the normal cancel button with its cutoff applies.
    for (const date of [...dropped.map((s) => s.date), ...revived.map((s) => s.date), ...createDays]) {
      const check = canBookSlot({ date: startOfDay(date), mealType: "LUNCH" }, now);
      if (!check.ok) {
        throw new Error(
          `Ngày ${localDateKey(date).split("-").reverse().join("/")} đã quá giờ nên không thêm hoặc bỏ được nữa. ${check.reason ?? ""}`.trim(),
        );
      }
    }
    const removeIds = dropped.map((s) => s.id);
    const reviveIds = revived.map((s) => s.id);

    let registration = await tx.mealRegistration.findFirst({
      where: { studentId: officerId, startDate: monday, mealPattern: "LUNCH" },
    });
    if (!registration && createDays.length > 0) {
      registration = await tx.mealRegistration.create({
        data: {
          studentId: officerId,
          startDate: monday,
          totalSessions: 0,
          mealPattern: "LUNCH",
          pricePerMeal: OFFICER_MEAL_PRICE,
          createdById: officerId,
        },
      });
    }

    if (removeIds.length > 0) await tx.mealSession.deleteMany({ where: { id: { in: removeIds } } });
    if (reviveIds.length > 0) {
      await tx.mealSession.updateMany({
        where: { id: { in: reviveIds } },
        data: { status: "SCHEDULED", cancelledAt: null },
      });
    }
    if (createDays.length > 0 && registration) {
      await tx.mealSession.createMany({
        data: createDays.map((date) => ({
          registrationId: registration.id,
          studentId: officerId,
          date,
          mealType: "LUNCH" as const,
          price: OFFICER_MEAL_PRICE,
        })),
      });
    }

    const total = await tx.mealSession.count({ where: { ...inWeek, status: { not: "CANCELLED" } } });
    if (registration) {
      const anyLeft = await tx.mealSession.count({ where: { registrationId: registration.id } });
      if (anyLeft === 0) await tx.mealRegistration.delete({ where: { id: registration.id } });
      else await tx.mealRegistration.update({ where: { id: registration.id }, data: { totalSessions: total } });
    }

    // The week as it now stands, so the caller can refresh its view without another round trip.
    const sessions = await tx.mealSession.findMany({
      where: inWeek,
      orderBy: { date: "asc" },
      select: { id: true, date: true, status: true, pickedUp: true },
    });

    return { added: createDays.length, removed: removeIds.length, revived: reviveIds.length, total, sessions };
  });
}

/** Cancel one officer lunch. No make-up slot is added: officers order week by week, not by package. */
export async function cancelOfficerSession(sessionId: string, opts: { bypassDeadline?: boolean } = {}) {
  const session = await prisma.mealSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (opts.bypassDeadline) {
    if (session.status !== "SCHEDULED") throw new Error("Buổi ăn này không còn ở trạng thái có thể hủy.");
  } else {
    const check = canCancelSession(session);
    if (!check.ok) throw new Error(check.reason ?? "Không thể hủy buổi ăn này.");
  }
  return prisma.mealSession.update({
    where: { id: sessionId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

/** Undo cancelOfficerSession. */
export async function restoreOfficerSession(sessionId: string, opts: { bypassDeadline?: boolean } = {}) {
  const session = await prisma.mealSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (opts.bypassDeadline) {
    if (session.status !== "CANCELLED") throw new Error("Buổi ăn này không ở trạng thái đã hủy.");
  } else {
    const check = canRestoreSession(session);
    if (!check.ok) throw new Error(check.reason ?? "Không thể khôi phục buổi ăn này.");
  }
  return prisma.mealSession.update({
    where: { id: sessionId },
    data: { status: "SCHEDULED", cancelledAt: null },
  });
}
