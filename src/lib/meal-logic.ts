import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/log";
import { MealPattern, MealType, SessionStatus } from "@prisma/client";
import {
  canBookSlot,
  canCancelSession,
  canRestoreSession,
  compareSlots,
  generateSessionPlan,
  nextSlot,
} from "@/lib/session-rules";
import { localDateKey } from "@/lib/client-session-rules";
import {
  ALL_DAY_LUNCH_DATES,
  OFFICER_MEAL_PRICE,
  officerCanCancel,
  officerCanRestore,
  officerWeekDays,
  officerCanBook,
  openWeekMondays,
  registrationDeadline,
} from "@/lib/officer-rules";

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
  await syncOfficerAutoRegistrations();
  // In the background: closes gaps in make-up meals once, the first time this version runs.
  void syncOneTimeCompaction();
  const now = new Date();
  const today = startOfDay(now);
  const hour = now.getHours();
  await prisma.mealSession.updateMany({
    where: {
      status: "SCHEDULED",
      OR: [
        { date: { lt: today } },
        // A meal ticked "Đã lấy" is used, even before its finishing time.
        { pickedUp: true },
        // (Not on a launch day when lunch stays open for registering and cancelling until midnight.)
        ...(hour >= LUNCH_DONE_HOUR && !ALL_DAY_LUNCH_DATES.includes(localDateKey(today))
          ? [{ date: today, mealType: "LUNCH" as const }]
          : []),
        ...(hour >= DINNER_DONE_HOUR ? [{ date: today, mealType: "DINNER" as const }] : []),
      ],
      ...(studentId ? { studentId } : {}),
    },
    data: { status: "COMPLETED" },
  });
}

/** Has the time of this meal passed (so it counts as finished even if nobody picked it up)? */
function mealTimeOver(date: Date, mealType: MealType, now: Date) {
  const today = startOfDay(now);
  if (date.getTime() < today.getTime()) return true;
  if (date.getTime() > today.getTime()) return false;
  if (mealType === "DINNER") return now.getHours() >= DINNER_DONE_HOUR;
  return now.getHours() >= LUNCH_DONE_HOUR && !ALL_DAY_LUNCH_DATES.includes(localDateKey(today));
}

/**
 * Ticks or unticks "Đã lấy" for meals. A meal that is picked up is used up at once: it moves from "scheduled"
 * to "completed" and drops out of the student's remaining count (it used to stay in until 14:00 / 20:00).
 * Unticking puts it back to "scheduled" if its time has not passed yet. Cancelled meals are left alone.
 * Returns how many meals were changed.
 */
export async function setPickedUp(ids: string[], pickedUp: boolean) {
  const now = new Date();
  const sessions = await prisma.mealSession.findMany({
    where: { id: { in: ids }, status: { not: "CANCELLED" } },
    select: { id: true, date: true, mealType: true },
  });
  if (sessions.length === 0) return 0;

  if (pickedUp) {
    await prisma.mealSession.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { pickedUp: true, pickedUpAt: now, status: "COMPLETED" },
    });
  } else {
    const back = sessions.filter((s) => !mealTimeOver(s.date, s.mealType, now)).map((s) => s.id);
    const stay = sessions.filter((s) => mealTimeOver(s.date, s.mealType, now)).map((s) => s.id);
    if (back.length > 0) {
      await prisma.mealSession.updateMany({
        where: { id: { in: back } },
        data: { pickedUp: false, pickedUpAt: null, status: "SCHEDULED" },
      });
    }
    if (stay.length > 0) {
      await prisma.mealSession.updateMany({ where: { id: { in: stay } }, data: { pickedUp: false, pickedUpAt: null } });
    }
  }
  return sessions.length;
}

/** Start of the note on a meal staff took out for good: it has no make-up and is not owed back. */
export const REMOVED_NOTE = "Xóa thủ công";
/** Start of the note on a scheduled meal taken off the end of a registration when an admin shrinks the package. */
const TRIMMED_NOTE = "Giảm gói";
/** Start of the note on the last meal given up when a missed meal is recorded (see recordMissedSession). */
export const SWAPPED_NOTE = "Tự động bớt buổi cuối";

const slotKey = (slot: { date: Date; mealType: MealType }) => `${localDateKey(slot.date)}-${slot.mealType}`;

type SlotRow = { date: Date; mealType: MealType; status: SessionStatus; note: string | null };

/**
 * The slots a student's schedule really holds: every live meal, plus the meals they cancelled themselves (or that
 * were imported as cancelled), which they gave up on purpose and must not be refilled. A cancelled row that
 * carries a note was taken out by staff or by a clean-up (removed, merged, trimmed, undone): its slot is free.
 */
function blockedSlotKeys(rows: SlotRow[]) {
  return new Set(rows.filter((r) => r.status !== "CANCELLED" || r.note === null).map(slotKey));
}

/**
 * The first slot after `from` (following the meal pattern) that is not in `occupied`. With `bookableOnly` it
 * must also still be possible to book it (not in the past, not past today's cutoff).
 */
function nextFreeSlot(from: { date: Date; mealType: MealType }, pattern: MealPattern, occupied: Set<string>, bookableOnly = false) {
  let cursor = from;
  for (let i = 0; i < 800; i++) {
    cursor = nextSlot(cursor, pattern);
    if (occupied.has(slotKey(cursor))) continue;
    if (bookableOnly && !canBookSlot(cursor).ok) continue;
    return cursor;
  }
  throw new Error("Không tìm được buổi trống để xếp thêm.");
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
    // Staff cancelling for the student: the cutoff does not apply, and a meal that has just passed
    // without being picked up can still be cancelled (and made up).
    const open = session.status === "SCHEDULED" || (session.status === "COMPLETED" && !session.pickedUp);
    if (!open) {
      throw new Error("Buổi ăn này không còn ở trạng thái có thể hủy.");
    }
  } else {
    const check = canCancelSession(session);
    if (!check.ok) {
      throw new Error(check.reason ?? "Không thể hủy buổi ăn này.");
    }
  }

  const studentSlots = await prisma.mealSession.findMany({
    where: { studentId: session.studentId },
    select: { date: true, mealType: true, status: true, note: true },
  });

  // The make-up meal goes into the first empty slot after the cancelled one (following the package's meal
  // pattern) that can still be booked: a gap in the student's schedule when there is one, otherwise the day
  // right after everything they already have, so the schedule stays unbroken. Slots held by a live meal of any
  // package — or cancelled by the student — are skipped: two meals never share a day and meal.
  const appended = nextFreeSlot(
    { date: session.date, mealType: session.mealType },
    session.registration.mealPattern,
    blockedSlotKeys(studentSlots),
    true,
  );

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
export async function restoreSession(
  sessionId: string,
  opts: { bypassDeadline?: boolean; allowUnremove?: boolean } = {},
) {
  const session = await prisma.mealSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { compensatedBy: true },
  });

  // A meal staff took out (or a package trim dropped) has no make-up to give back: undoing it just puts it back.
  if (session.status === "CANCELLED" && !session.compensatedBy && isStaffRemoval(session.note)) {
    if (!opts.allowUnremove) throw new Error("Chỉ Quản lý hoặc Admin mới khôi phục được buổi đã xóa.");
    return unremoveSession(session);
  }

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
  if (compensation && compensation.status === "CANCELLED" && isStaffRemoval(compensation.note)) {
    // The make-up meal was taken out by staff: restoring the original simply drops that leftover row.
    if (!opts.allowUnremove) throw new Error("Chỉ Quản lý hoặc Admin mới khôi phục được buổi bù đã xóa.");
  } else if (!compensation || compensation.status !== "SCHEDULED" || compensation.pickedUp) {
    throw new Error("Suất bù cho lần hủy này đã được dùng, không thể khôi phục.");
  }

  // The slot may have been taken meanwhile (a renewal that starts on that day, a make-up meal): putting this
  // meal back would give the student two meals at the same day and meal.
  const clash = await prisma.mealSession.findFirst({
    where: {
      studentId: session.studentId,
      date: session.date,
      mealType: session.mealType,
      status: { not: "CANCELLED" },
      id: { not: session.id },
    },
    select: { id: true },
  });
  if (clash) {
    throw new Error("Sinh viên đã có một suất khác vào đúng ngày và bữa này (từ đợt đăng ký khác), không khôi phục được.");
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
 * Merges double bookings into one meal: where a student has several live meals at the same day and meal, one
 * stays (a picked-up one first, then a finished one, then the one from the oldest registration) and the others
 * are taken out as removed (kept in the record, not owed back, and can be put back by an admin if one was
 * right). Meals already picked up are never touched. With `studentId` only that student is merged.
 */
export async function mergeDuplicateSessions(studentId?: string) {
  const groups = await prisma.mealSession.groupBy({
    by: ["studentId", "date", "mealType"],
    where: { status: { not: "CANCELLED" }, student: { role: "STUDENT" }, ...(studentId ? { studentId } : {}) },
    having: { id: { _count: { gt: 1 } } },
    _count: { id: true },
  });

  const students = new Set<string>();
  let merged = 0;
  let skipped = 0;
  for (const g of groups) {
    const slot = await prisma.mealSession.findMany({
      where: { studentId: g.studentId, date: g.date, mealType: g.mealType, status: { not: "CANCELLED" } },
      select: { id: true, status: true, pickedUp: true, registration: { select: { createdAt: true } } },
    });
    const rank = (x: (typeof slot)[number]) => (x.pickedUp ? 0 : x.status === "COMPLETED" ? 1 : 2);
    slot.sort((a, b) => rank(a) - rank(b) || a.registration.createdAt.getTime() - b.registration.createdAt.getTime());
    const extras = slot.slice(1);
    const removable = extras.filter((x) => !x.pickedUp);
    skipped += extras.length - removable.length;
    if (removable.length === 0) continue;
    await prisma.mealSession.updateMany({
      where: { id: { in: removable.map((x) => x.id) } },
      data: { status: "CANCELLED", cancelledAt: new Date(), note: `${REMOVED_NOTE} - gộp buổi trùng` },
    });
    merged += removable.length;
    students.add(g.studentId);
  }
  return { students: students.size, merged, skipped };
}

/**
 * Staff fix for a double booking: the student has two meals at the same day and meal. The extra one (not
 * picked up) moves to the first free day after the registration's last slot, following the meal pattern, so
 * the student still gets every meal they bought. A meal already marked finished goes back to "scheduled".
 */
export async function moveDuplicateSession(sessionId: string) {
  const session = await prisma.mealSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { registration: true },
  });
  if (session.status === "CANCELLED") throw new Error("Buổi này đã bị hủy.");
  if (session.pickedUp) throw new Error("Buổi này đã được lấy cơm, không dời được.");

  const clash = await prisma.mealSession.findFirst({
    where: {
      studentId: session.studentId,
      date: session.date,
      mealType: session.mealType,
      status: { not: "CANCELLED" },
      id: { not: session.id },
    },
    select: { id: true },
  });
  if (!clash) throw new Error("Buổi này không bị trùng với buổi nào khác.");

  const [regSlots, studentSlots] = await Promise.all([
    prisma.mealSession.findMany({ where: { registrationId: session.registrationId }, select: { date: true, mealType: true } }),
    prisma.mealSession.findMany({ where: { studentId: session.studentId }, select: { date: true, mealType: true, status: true, note: true } }),
  ]);
  const yesterday = { date: addDays(startOfDay(new Date()), -1), mealType: "DINNER" as MealType };
  const last = [...regSlots, yesterday].sort(compareSlots).at(-1)!;
  const slot = nextFreeSlot(last, session.registration.mealPattern, blockedSlotKeys(studentSlots), true);

  const moved = await prisma.mealSession.update({
    where: { id: session.id },
    data: {
      date: slot.date,
      mealType: slot.mealType,
      status: "SCHEDULED",
      note: `Dời từ ngày ${localDateKey(session.date).split("-").reverse().join("/")} (${session.mealType === "LUNCH" ? "trưa" : "tối"}) do trùng buổi`,
    },
  });
  return { moved, from: { date: session.date, mealType: session.mealType } };
}

/**
 * Is this note the one left by a meal that staff took out on purpose: a removal, a package trim, or the last
 * meal given up when a missed meal was recorded? Such a meal can be put back by a manager or admin.
 */
function isStaffRemoval(note: string | null) {
  return !!note && (note.startsWith(REMOVED_NOTE) || note.startsWith(TRIMMED_NOTE) || note.startsWith(SWAPPED_NOTE));
}

/** Puts back a meal that staff removed (or that a package trim dropped), as it was before. */
async function unremoveSession(session: { id: string; studentId: string; date: Date; mealType: MealType; note: string | null; pickedUp: boolean }) {
  const clash = await prisma.mealSession.findFirst({
    where: { studentId: session.studentId, date: session.date, mealType: session.mealType, status: { not: "CANCELLED" }, id: { not: session.id } },
  });
  if (clash) throw new Error("Sinh viên đã có một buổi ăn khác vào đúng ngày và bữa này, không khôi phục được.");
  // A removed meal that had been eaten goes back to "finished"; an unused one goes back to "scheduled".
  const wasEaten = session.pickedUp || !!session.note?.includes("buổi đã ăn");

  // A meal that was given up when a missed meal was recorded comes back in exchange for the student's real last
  // meal (which may be a different one by now), so the student keeps the same number of meals.
  const swappedBack = session.note?.startsWith(SWAPPED_NOTE)
    ? await lastUpcomingSession(session.studentId, session.id)
    : null;
  const giveUp =
    swappedBack && compareSlots(swappedBack, session) > 0 ? swappedBack : null;

  const [restored] = await prisma.$transaction([
    prisma.mealSession.update({
      where: { id: session.id },
      data: { status: wasEaten ? "COMPLETED" : "SCHEDULED", cancelledAt: null, note: null },
    }),
    ...(giveUp
      ? [
          prisma.mealSession.update({
            where: { id: giveUp.id },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              note: `${SWAPPED_NOTE} để đổi chỗ khi khôi phục buổi ngày ${localDateKey(session.date).split("-").reverse().join("/")}`,
            },
          }),
        ]
      : []),
  ]);
  return { restored, removedCompensationId: undefined as string | undefined };
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

export type RegistrationBalance = {
  /** Meals bought (the registration's total). */
  total: number;
  /** Meals eaten or marked finished. */
  completed: number;
  /** Meals still to come. */
  scheduled: number;
  /** Cancelled meals (each normally has a make-up meal in `scheduled`). */
  cancelled: number;
  /** Of those, meals staff took out for good (wrongly recorded or duplicated): bought, but not owed. */
  removed: number;
  /**
   * total - removed - completed - scheduled: the meals still owed (positive) or in excess (negative).
   * A cancelled meal is owed a make-up, so each one is matched by a make-up meal inside `scheduled` or
   * `completed`; a meal that was simply not eaten counts as `completed` and is not made up. Normally 0.
   */
  missing: number;
};

/** How the meals of each given registration add up against what was bought. */
export async function registrationBalances(registrations: { id: string; totalSessions: number }[]) {
  const ids = registrations.map((r) => r.id);
  const [counts, removedCounts] = await Promise.all([
    prisma.mealSession.groupBy({
      by: ["registrationId", "status"],
      where: { registrationId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.mealSession.groupBy({
      by: ["registrationId"],
      where: { registrationId: { in: ids }, status: "CANCELLED", note: { startsWith: REMOVED_NOTE } },
      _count: { _all: true },
    }),
  ]);
  const result = new Map<string, RegistrationBalance>();
  for (const r of registrations) {
    const of = (status: SessionStatus) =>
      counts.find((c) => c.registrationId === r.id && c.status === status)?._count._all ?? 0;
    const completed = of("COMPLETED");
    const scheduled = of("SCHEDULED");
    const removed = removedCounts.find((c) => c.registrationId === r.id)?._count._all ?? 0;
    result.set(r.id, {
      total: r.totalSessions,
      completed,
      scheduled,
      cancelled: of("CANCELLED"),
      removed,
      missing: r.totalSessions - removed - completed - scheduled,
    });
  }
  return result;
}

const dayLabel = (d: Date) => localDateKey(d).split("-").reverse().join("/");

/**
 * Admin tool, only ever run by hand for one registration: brings it back in line with the package so the
 * student ends up with exactly the meals they bought (minus any staff removed on purpose). Nothing runs it
 * automatically.
 *  - Short (e.g. a cancelled meal never got its make-up): adds the missing meals after the registration's last
 *    slot, following the meal pattern, on days the student has no meal and that can still be booked. Each new
 *    meal is attached to a cancelled meal that was still owed one (oldest first), so restoring that cancelled
 *    meal later takes its make-up away again.
 *  - Too many: takes the surplus off the end of the schedule (only meals not eaten yet).
 * A meal that was simply not eaten is already counted as eaten, so it is never made up.
 */
export async function reconcileRegistration(registrationId: string) {
  const registration = await prisma.mealRegistration.findUniqueOrThrow({ where: { id: registrationId } });
  const balance = (await registrationBalances([registration])).get(registration.id)!;
  const none = { added: 0, trimmed: 0, slots: [] as { date: Date; mealType: MealType }[] };
  if (balance.missing === 0) throw new Error("Gói này đã khớp số buổi, không cần chỉnh.");

  if (balance.missing > 0) {
    // Cancelled meals still without a make-up (not removed, swapped or trimmed on purpose), oldest first.
    const owed = await prisma.mealSession.findMany({
      where: {
        registrationId,
        status: "CANCELLED",
        compensatedBy: { is: null },
        OR: [
          { note: null },
          {
            NOT: [
              { note: { startsWith: REMOVED_NOTE } },
              { note: { startsWith: SWAPPED_NOTE } },
              { note: { startsWith: TRIMMED_NOTE } },
            ],
          },
        ],
      },
      select: { id: true, date: true },
    });
    owed.sort((a, b) => a.date.getTime() - b.date.getTime());
    const items = Array.from({ length: balance.missing }, (_, i) => {
      const original = owed[i];
      return original
        ? { note: `Bù cho buổi đã hủy ngày ${dayLabel(original.date)} (admin bù)`, compensationForId: original.id }
        : { note: "Bù buổi còn thiếu so với gói đã mua (admin bù)" };
    });
    const slots = await appendMeals(registration, items);
    return { added: slots.length, trimmed: 0, slots };
  }

  // Surplus: drop the last meals that have not been eaten yet.
  const upcoming = await prisma.mealSession.findMany({
    where: { registrationId, status: "SCHEDULED", pickedUp: false },
    select: { id: true, date: true, mealType: true },
  });
  const drop = [...upcoming].sort(compareSlots).slice(-Math.min(-balance.missing, upcoming.length));
  if (drop.length === 0) {
    throw new Error(
      "Không có buổi nào chưa ăn để bớt: các buổi dư đều đã dùng. Muốn bỏ một buổi đã dùng, hãy bấm Xóa ở đúng hàng buổi đó trong Lịch buổi ăn.",
    );
  }
  await prisma.mealSession.updateMany({
    where: { id: { in: drop.map((d) => d.id) } },
    data: { status: "CANCELLED", cancelledAt: new Date(), note: `${TRIMMED_NOTE} (admin bớt buổi dư so với gói)` },
  });
  return { ...none, trimmed: drop.length };
}

/**
 * Adds one scheduled meal per item after the registration's last slot (or after yesterday's dinner when that is
 * later, so nothing lands in the past), on days the student has no meal yet and that can still be booked.
 */
async function appendMeals(
  registration: { id: string; studentId: string; mealPattern: MealPattern; pricePerMeal: number },
  items: { note: string; compensationForId?: string }[],
) {
  const [regSlots, studentSlots] = await Promise.all([
    prisma.mealSession.findMany({ where: { registrationId: registration.id }, select: { date: true, mealType: true } }),
    prisma.mealSession.findMany({ where: { studentId: registration.studentId }, select: { date: true, mealType: true, status: true, note: true } }),
  ]);
  const occupied = blockedSlotKeys(studentSlots);
  const yesterday = { date: addDays(startOfDay(new Date()), -1), mealType: "DINNER" as MealType };
  const last = [...regSlots, yesterday].sort(compareSlots).at(-1)!;

  const slots: { date: Date; mealType: MealType }[] = [];
  let cursor = last;
  for (let i = 0; i < items.length; i++) {
    cursor = nextFreeSlot(cursor, registration.mealPattern, occupied, true);
    occupied.add(slotKey(cursor));
    slots.push(cursor);
  }

  await prisma.mealSession.createMany({
    data: slots.map((slot, i) => ({
      registrationId: registration.id,
      studentId: registration.studentId,
      date: slot.date,
      mealType: slot.mealType,
      status: "SCHEDULED" as const,
      price: registration.pricePerMeal,
      note: items[i].note,
      compensationForId: items[i].compensationForId,
    })),
  });
  return slots;
}

/**
 * Admin: edits a meal package. A new total adds meals at the end of the schedule, or takes the extra ones off
 * the end (only meals not eaten yet); a new price applies to the meals still to come, and to the eaten ones too
 * when `priceForEaten` is set. Cancelled meals keep their old price.
 */
export async function updateRegistrationPackage(params: {
  registrationId: string;
  totalSessions?: number;
  pricePerMeal?: number;
  note?: string | null;
  priceForEaten?: boolean;
}) {
  const registration = await prisma.mealRegistration.findUniqueOrThrow({ where: { id: params.registrationId } });
  const summary: string[] = [];

  const total = params.totalSessions ?? registration.totalSessions;
  const delta = total - registration.totalSessions;
  let trimmedIds: string[] = [];
  if (delta < 0) {
    const upcoming = await prisma.mealSession.findMany({
      where: { registrationId: registration.id, status: "SCHEDULED", pickedUp: false },
      select: { id: true, date: true, mealType: true },
    });
    if (upcoming.length < -delta) {
      throw new Error(`Chỉ còn ${upcoming.length} buổi chưa ăn nên không giảm được ${-delta} buổi.`);
    }
    trimmedIds = [...upcoming].sort(compareSlots).slice(delta).map((u) => u.id);
  }

  const price = params.pricePerMeal ?? registration.pricePerMeal;
  await prisma.$transaction([
    prisma.mealRegistration.update({
      where: { id: registration.id },
      data: {
        totalSessions: total,
        pricePerMeal: price,
        ...(params.note !== undefined ? { note: params.note } : {}),
      },
    }),
    ...(trimmedIds.length > 0
      ? [
          prisma.mealSession.updateMany({
            where: { id: { in: trimmedIds } },
            data: { status: "CANCELLED", cancelledAt: new Date(), note: `${TRIMMED_NOTE} theo chỉnh sửa gói` },
          }),
        ]
      : []),
    ...(price !== registration.pricePerMeal
      ? [
          prisma.mealSession.updateMany({
            where: {
              registrationId: registration.id,
              status: params.priceForEaten ? { not: "CANCELLED" } : "SCHEDULED",
            },
            data: { price },
          }),
        ]
      : []),
  ]);
  if (delta < 0) summary.push(`giảm ${-delta} buổi`);
  if (price !== registration.pricePerMeal) summary.push(`giá ${registration.pricePerMeal} → ${price}`);

  if (delta > 0) {
    const updated = await prisma.mealRegistration.findUniqueOrThrow({ where: { id: registration.id } });
    await appendMeals(updated, Array.from({ length: delta }, () => ({ note: "Thêm theo chỉnh sửa gói" })));
    summary.push(`thêm ${delta} buổi`);
  }
  if (params.note !== undefined && params.note !== registration.note) summary.push("ghi chú");
  return { summary, added: Math.max(delta, 0), removed: trimmedIds.length };
}

/**
 * Closes the gaps in one student's upcoming make-up meals: each make-up meal that is still to come moves to the
 * earliest free slot that is after the meal it makes up for and can still be booked (following its package's
 * pattern), when that is earlier than where it sits now. With `apply` false nothing is written: it only counts. Only the day and meal of those make-up meals change:
 * nobody gains or loses a meal, and meals already eaten or picked up are never touched. Returns how many moved.
 */
export async function compactStudentUpcoming(studentId: string, apply = true) {
  const sessions = await prisma.mealSession.findMany({
    where: { studentId },
    select: {
      id: true,
      date: true,
      mealType: true,
      status: true,
      note: true,
      pickedUp: true,
      compensationForId: true,
      compensationFor: { select: { date: true, mealType: true } },
      registration: { select: { mealPattern: true } },
    },
  });
  const blocked = blockedSlotKeys(sessions);
  const movable = sessions
    .filter((s) => s.status === "SCHEDULED" && !s.pickedUp && s.compensationForId)
    .sort(compareSlots);

  const now = new Date();
  const yesterday = { date: addDays(startOfDay(now), -1), mealType: "DINNER" as MealType };
  let moved = 0;
  for (const m of movable) {
    // After the cancelled meal it makes up for, and never in the past.
    const origin = m.compensationFor ? [m.compensationFor, yesterday].sort(compareSlots).at(-1)! : yesterday;
    let cursor: { date: Date; mealType: MealType } = origin;
    let target: { date: Date; mealType: MealType } | null = null;
    for (let i = 0; i < 800; i++) {
      cursor = nextSlot(cursor, m.registration.mealPattern);
      if (compareSlots(cursor, m) >= 0) break;
      // Staff-side fix, so today counts until the meal itself is over (the students' own cutoff does not apply).
      if (blocked.has(slotKey(cursor)) || mealTimeOver(cursor.date, cursor.mealType, now)) continue;
      target = cursor;
      break;
    }
    if (!target) continue;
    if (apply) {
      await prisma.mealSession.update({ where: { id: m.id }, data: { date: target.date, mealType: target.mealType } });
    }
    blocked.delete(slotKey(m));
    blocked.add(slotKey(target));
    moved += 1;
  }
  return moved;
}

export type AuditStudentRef = { studentId: string; name: string; phone: string; orderCode: number | null };

export type SystemAudit = {
  checkedStudents: number;
  checkedRegistrations: number;
  /** Two live meals on the same day and meal. */
  duplicates: (AuditStudentRef & { slots: number })[];
  /** Registrations whose meals do not add up with what was bought. */
  mismatches: (AuditStudentRef & {
    registrationId: string;
    startDate: Date;
    total: number;
    used: number;
    upcoming: number;
    removed: number;
    missing: number;
  })[];
  /** Make-up meals that would move to an earlier empty slot (gaps in the schedule). */
  gaps: (AuditStudentRef & { moves: number })[];
  /** Make-up meals that sit before the cancelled meal they make up for. */
  outOfOrder: (AuditStudentRef & { count: number })[];
  /** Registrations whose start date is not the day of their first meal. */
  startMismatch: (AuditStudentRef & { registrationId: string; startDate: Date; firstMeal: Date })[];
};

/**
 * Read-only check of every active student: double bookings, packages that do not add up, gaps in the make-up
 * meals, make-up meals out of order and registrations whose start date does not match their first meal.
 * Nothing is changed; each finding has its own fix.
 */
export async function auditSystem(): Promise<SystemAudit> {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT", active: true },
    select: { id: true, name: true, phone: true, orderCode: true },
  });
  const ref = new Map(students.map((s) => [s.id, { studentId: s.id, name: s.name, phone: s.phone, orderCode: s.orderCode }]));
  const ids = students.map((s) => s.id);

  const [registrations, sessions] = await Promise.all([
    prisma.mealRegistration.findMany({
      where: { studentId: { in: ids } },
      select: { id: true, studentId: true, startDate: true, totalSessions: true },
    }),
    prisma.mealSession.findMany({
      where: { studentId: { in: ids } },
      select: {
        id: true,
        studentId: true,
        registrationId: true,
        date: true,
        mealType: true,
        status: true,
        compensationForId: true,
        compensationFor: { select: { date: true, mealType: true } },
      },
    }),
  ]);

  // Double bookings
  const live = new Map<string, number>();
  for (const s of sessions) {
    if (s.status === "CANCELLED") continue;
    const key = `${s.studentId}|${slotKey(s)}`;
    live.set(key, (live.get(key) ?? 0) + 1);
  }
  const dupByStudent = new Map<string, number>();
  for (const [key, n] of live) {
    if (n > 1) {
      const id = key.split("|")[0];
      dupByStudent.set(id, (dupByStudent.get(id) ?? 0) + 1);
    }
  }
  const duplicates = [...dupByStudent].map(([id, slots]) => ({ ...ref.get(id)!, slots }));

  // Packages that do not add up
  const balances = await registrationBalances(registrations);
  const mismatches = registrations
    .filter((r) => (balances.get(r.id)?.missing ?? 0) !== 0)
    .map((r) => {
      const b = balances.get(r.id)!;
      return {
        ...ref.get(r.studentId)!,
        registrationId: r.id,
        startDate: r.startDate,
        total: r.totalSessions,
        used: b.completed,
        upcoming: b.scheduled,
        removed: b.removed,
        missing: b.missing,
      };
    });

  // Make-up meals before the meal they make up for
  const outByStudent = new Map<string, number>();
  for (const s of sessions) {
    if (s.status === "CANCELLED" || !s.compensationFor) continue;
    if (compareSlots(s, s.compensationFor) < 0) outByStudent.set(s.studentId, (outByStudent.get(s.studentId) ?? 0) + 1);
  }
  const outOfOrder = [...outByStudent].map(([id, count]) => ({ ...ref.get(id)!, count }));

  // Start date vs first meal of each registration
  const firstByReg = new Map<string, Date>();
  for (const s of sessions) {
    const cur = firstByReg.get(s.registrationId);
    if (!cur || s.date.getTime() < cur.getTime()) firstByReg.set(s.registrationId, s.date);
  }
  const startMismatch = registrations
    .filter((r) => {
      const first = firstByReg.get(r.id);
      return first && localDateKey(first) !== localDateKey(r.startDate);
    })
    .map((r) => ({ ...ref.get(r.studentId)!, registrationId: r.id, startDate: r.startDate, firstMeal: firstByReg.get(r.id)! }));

  // Gaps: a dry run of the compaction
  const withUpcomingMakeup = [
    ...new Set(
      sessions.filter((s) => s.status === "SCHEDULED" && s.compensationForId).map((s) => s.studentId),
    ),
  ];
  const gaps: SystemAudit["gaps"] = [];
  for (const id of withUpcomingMakeup) {
    const moves = await compactStudentUpcoming(id, false);
    if (moves > 0) gaps.push({ ...ref.get(id)!, moves });
  }

  const byOrder = <T extends AuditStudentRef>(a: T, b: T) => (a.orderCode ?? 1e9) - (b.orderCode ?? 1e9) || a.name.localeCompare(b.name, "vi");
  return {
    checkedStudents: students.length,
    checkedRegistrations: registrations.length,
    duplicates: duplicates.sort(byOrder),
    mismatches: mismatches.sort(byOrder),
    gaps: gaps.sort(byOrder),
    outOfOrder: outOfOrder.sort(byOrder),
    startMismatch: startMismatch.sort(byOrder),
  };
}

/** Runs compactStudentUpcoming for every active student that has an upcoming make-up meal. */
export async function compactAllStudents() {
  const students = await prisma.mealSession.findMany({
    where: { status: "SCHEDULED", pickedUp: false, compensationForId: { not: null }, student: { role: "STUDENT", active: true } },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  let moved = 0;
  let touched = 0;
  for (const { studentId } of students) {
    const n = await compactStudentUpcoming(studentId);
    if (n > 0) touched += 1;
    moved += n;
  }
  return { students: students.length, touched, moved };
}

let compactionChecked = false;

/** Once ever (activity-log marker): closes the gaps already in the schedules. Runs in the background, never throws. */
export async function syncOneTimeCompaction() {
  if (compactionChecked) return;
  compactionChecked = true;
  try {
    const done = await prisma.activityLog.findFirst({ where: { action: "COMPACT_MAKEUPS" } });
    if (done) return;
    const result = await compactAllStudents();
    await logActivity(
      null,
      "COMPACT_MAKEUPS",
      `Dồn các buổi bù về liền ngày: ${result.touched}/${result.students} sinh viên, dời ${result.moved} buổi bù vào chỗ trống`,
    );
  } catch (err) {
    compactionChecked = false;
    console.error("Compaction failed", err);
  }
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

/** The student's last meal still to come, over every registration: what the schedule ends with right now. */
async function lastUpcomingSession(studentId: string, exceptId?: string) {
  const upcoming = await prisma.mealSession.findMany({
    where: { studentId, status: "SCHEDULED", pickedUp: false, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, date: true, mealType: true, registrationId: true },
  });
  return upcoming.length > 0 ? [...upcoming].sort(compareSlots).at(-1)! : null;
}

/**
 * Staff fix for a meal the student cancelled that never made it into the schedule: it is added to the registration
 * as already cancelled. The package keeps the number of meals that was paid for, so nobody gets a meal for free:
 *  - if the package already has all its meals (eaten + to come + removed = bought), the cancelled meal is only
 *    recorded and no make-up is added;
 *  - if the package is short (so the student really lost this meal), one make-up meal is added at the first
 *    empty slot after it, as if the student had cancelled in time.
 */
export async function addCancelledWithMakeup(params: { registrationId: string; date: Date; mealType: MealType }) {
  const registration = await prisma.mealRegistration.findUniqueOrThrow({ where: { id: params.registrationId } });
  const day = startOfDay(params.date);

  const studentSlots = await prisma.mealSession.findMany({
    where: { studentId: registration.studentId },
    select: { date: true, mealType: true, status: true, note: true },
  });
  const key = slotKey({ date: day, mealType: params.mealType });
  const taken = studentSlots.find((s) => slotKey(s) === key && (s.status !== "CANCELLED" || s.note === null));
  if (taken) {
    throw new Error(
      taken.status === "CANCELLED"
        ? "Buổi này đã được hủy rồi, không cần thêm."
        : "Sinh viên đang có buổi ăn này trong lịch. Hãy dùng nút Hủy hộ + bù ở hàng buổi đó.",
    );
  }

  const balance = (await registrationBalances([registration])).get(registration.id)!;
  const short = balance.missing > 0;
  const makeup = short
    ? nextFreeSlot({ date: day, mealType: params.mealType }, registration.mealPattern, blockedSlotKeys(studentSlots), true)
    : null;

  return prisma.$transaction(async (tx) => {
    const cancelled = await tx.mealSession.create({
      data: {
        registrationId: registration.id,
        studentId: registration.studentId,
        date: day,
        mealType: params.mealType,
        status: "CANCELLED",
        cancelledAt: new Date(),
        price: registration.pricePerMeal,
      },
    });
    const created = makeup
      ? await tx.mealSession.create({
          data: {
            registrationId: registration.id,
            studentId: registration.studentId,
            date: makeup.date,
            mealType: makeup.mealType,
            status: "SCHEDULED",
            price: registration.pricePerMeal,
            compensationForId: cancelled.id,
          },
        })
      : null;
    return { cancelled, newSession: created };
  });
}

/**
 * Data-entry fix: staff forgot to register a meal the student already ate (e.g. picked "start
 * from dinner" although lunch that day was already served). Either lunch or dinner can be recorded
 * whatever the package. The student only paid for so many meals, so the schedule must not grow: the meal
 * that is LAST in the student's schedule as it stands now (over all their registrations, make-up meals
 * included) is moved to the missed day and marked as eaten. The student ends up with the same number of
 * meals, the schedule loses its last one, and every registration still adds up. Only when nothing is left
 * to come is the missed meal added to the chosen registration as an extra.
 */
export async function recordMissedSession(params: { registrationId: string; date: Date; mealType: MealType }) {
  const registration = await prisma.mealRegistration.findUniqueOrThrow({ where: { id: params.registrationId } });

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

  const last = await lastUpcomingSession(registration.studentId);
  const note = "Bổ sung buổi bị bỏ sót khi đăng ký (sinh viên đã ăn nhưng chưa được ghi nhận)";

  if (last) {
    const created = await prisma.mealSession.update({
      where: { id: last.id },
      data: {
        date: day,
        mealType: params.mealType,
        status: "COMPLETED",
        pickedUp: true,
        pickedUpAt: new Date(),
        note: `${note}; lấy buổi cuối lịch (${localDateKey(last.date).split("-").reverse().join("/")} ${last.mealType === "LUNCH" ? "trưa" : "tối"}) chuyển sang`,
      },
    });
    return { created, movedFrom: { date: last.date, mealType: last.mealType } };
  }

  const created = await prisma.mealSession.create({
    data: {
      registrationId: registration.id,
      studentId: registration.studentId,
      date: day,
      mealType: params.mealType,
      status: "COMPLETED",
      pickedUp: true,
      pickedUpAt: new Date(),
      price: registration.pricePerMeal,
      note,
    },
  });
  return { created, movedFrom: null };
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
          ? `${REMOVED_NOTE} buổi đã ăn để chỉnh lại số buổi/doanh thu bị sai`
          : `${REMOVED_NOTE} để chỉnh lại số buổi bị dư`,
    },
  });
}

/**
 * Officer ("cán bộ") ordering: saves which weekdays of the week starting `weekMonday` they want
 * lunch. Only allowed until 15:00 on the Sunday before that week. Days dropped before the
 * deadline are simply removed (the officer never committed to them); days that were cancelled
 * earlier and are picked again are switched back on.
 */
export async function saveOfficerWeek(params: { officerId: string; weekMonday: Date; days: Date[] }) {
  const now = new Date();
  const monday = startOfDay(params.weekMonday);
  if (monday.getDay() !== 1) throw new Error("Tuần đăng ký không hợp lệ.");
  if (now.getTime() > registrationDeadline(monday).getTime()) {
    throw new Error("Đã hết hạn đăng ký cho tuần này. Cán bộ phải đăng ký trước 15h Chủ nhật của tuần trước đó.");
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
      const check = officerCanBook({ date: startOfDay(date), mealType: "LUNCH" }, now);
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

let lastAutoRegistrationRun = 0;

/**
 * Automatic registration: every active officer with `autoRegister` gets lunch Monday to Friday in each week
 * that is open for ordering, the first time that week is seen. It happens once per officer and week (the
 * Monday of the last week done is kept in `autoRegisteredWeek`), so a day the officer later drops is not put
 * back. Days that are already past or past their cutoff, and days already registered or cancelled, are left
 * alone. Runs from `syncCompletedSessions`, at most once a minute per server process; failures are logged
 * and never break the caller.
 */
export async function syncOfficerAutoRegistrations() {
  const nowMs = Date.now();
  if (nowMs - lastAutoRegistrationRun < 60_000) return;
  lastAutoRegistrationRun = nowMs;

  try {
    const officers = await prisma.user.findMany({
      where: { autoRegister: true, isOfficer: true, active: true },
      select: { id: true, name: true },
    });
    if (officers.length === 0) return;

    const now = new Date();
    for (const monday of openWeekMondays(now)) {
      for (const officer of officers) {
        // Claim the week first, so two requests at the same time cannot both fill it in.
        const claim = await prisma.user.updateMany({
          where: { id: officer.id, OR: [{ autoRegisteredWeek: null }, { autoRegisteredWeek: { lt: monday } }] },
          data: { autoRegisteredWeek: monday },
        });
        if (claim.count === 0) continue;

        try {
          const existing = await prisma.mealSession.findMany({
            where: { studentId: officer.id, mealType: "LUNCH", date: { gte: monday, lt: addDays(monday, 7) } },
            select: { date: true, status: true },
          });
          const known = new Set(existing.map((e) => localDateKey(e.date)));
          // Keep what is already registered, and add every weekday that has nothing yet and can still be booked.
          const days = officerWeekDays(monday).filter((d) => {
            const key = localDateKey(d);
            if (known.has(key)) return existing.some((e) => localDateKey(e.date) === key && e.status === "SCHEDULED");
            return officerCanBook({ date: d, mealType: "LUNCH" }, now).ok;
          });
          const result = await saveOfficerWeek({ officerId: officer.id, weekMonday: monday, days });
          await logActivity(
            officer.id,
            "OFFICER_AUTO_REGISTER",
            `Tự động đăng ký cơm trưa tuần ${localDateKey(monday)} cho ${officer.name}: ${result.total} ngày (thêm ${result.added})`,
          );
        } catch (err) {
          console.error("Auto-registration failed for", officer.id, localDateKey(monday), err);
          // Give the week back so the next run tries again (days already registered are left as they are).
          await prisma.user.updateMany({ where: { id: officer.id, autoRegisteredWeek: monday }, data: { autoRegisteredWeek: null } });
        }
      }
    }
  } catch (err) {
    console.error("Auto-registration run failed", err);
  }
}

/** Cancel one officer lunch. No make-up slot is added: officers order week by week, not by package. */
export async function cancelOfficerSession(sessionId: string, opts: { bypassDeadline?: boolean } = {}) {
  const session = await prisma.mealSession.findUniqueOrThrow({ where: { id: sessionId } });
  if (opts.bypassDeadline) {
    if (session.status !== "SCHEDULED") throw new Error("Buổi ăn này không còn ở trạng thái có thể hủy.");
  } else {
    const check = officerCanCancel(session);
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
    const check = officerCanRestore(session);
    if (!check.ok) throw new Error(check.reason ?? "Không thể khôi phục buổi ăn này.");
  }
  return prisma.mealSession.update({
    where: { id: sessionId },
    data: { status: "SCHEDULED", cancelledAt: null },
  });
}
