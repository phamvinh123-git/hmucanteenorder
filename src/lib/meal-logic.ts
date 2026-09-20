import { startOfDay } from "date-fns";
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
}) {
  const slots = generateSessionPlan(params.startDate, params.mealPattern, params.totalSessions);

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

/** Marks past scheduled sessions as completed. Call before reading session data. */
export async function syncCompletedSessions(studentId?: string) {
  const today = startOfDay(new Date());
  await prisma.mealSession.updateMany({
    where: {
      status: "SCHEDULED",
      date: { lt: today },
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
