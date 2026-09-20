import { addDays, startOfDay } from "date-fns";
import { MealPattern, MealType, SessionStatus } from "@prisma/client";

export const LUNCH_CUTOFF_HOUR = 8; // cancel lunch only before 08:00 same day
export const DINNER_CUTOFF_HOUR = 14; // cancel dinner only before 14:00 same day
export const LOW_MEAL_THRESHOLD = 2; // flag student red when remaining < 2

export type Slot = { date: Date; mealType: MealType };

/** Order used for same-day slots: lunch always precedes dinner. */
export function mealTypeRank(mealType: MealType) {
  return mealType === "LUNCH" ? 0 : 1;
}

export function compareSlots(a: Slot, b: Slot) {
  const dateDiff = a.date.getTime() - b.date.getTime();
  if (dateDiff !== 0) return dateDiff;
  return mealTypeRank(a.mealType) - mealTypeRank(b.mealType);
}

/** Returns the slot immediately following `from`, given the registration's meal pattern. */
export function nextSlot(from: Slot, mealPattern: MealPattern): Slot {
  if (mealPattern === "BOTH") {
    if (from.mealType === "LUNCH") {
      return { date: from.date, mealType: "DINNER" };
    }
    return { date: addDays(from.date, 1), mealType: "LUNCH" };
  }
  const mealType: MealType = mealPattern === "LUNCH" ? "LUNCH" : "DINNER";
  return { date: addDays(from.date, 1), mealType };
}

/** Builds the initial list of meal slots for a brand-new registration. */
export function generateSessionPlan(
  startDate: Date,
  mealPattern: MealPattern,
  totalSessions: number,
): Slot[] {
  const start = startOfDay(startDate);
  const slots: Slot[] = [];

  let cursor: Slot =
    mealPattern === "BOTH"
      ? { date: start, mealType: "LUNCH" }
      : { date: start, mealType: mealPattern === "LUNCH" ? "LUNCH" : "DINNER" };

  for (let i = 0; i < totalSessions; i++) {
    slots.push(cursor);
    if (i < totalSessions - 1) {
      cursor = nextSlot(cursor, mealPattern);
    }
  }
  return slots;
}

export function cancelCutoff(sessionDate: Date, mealType: MealType) {
  const cutoff = startOfDay(sessionDate);
  cutoff.setHours(mealType === "LUNCH" ? LUNCH_CUTOFF_HOUR : DINNER_CUTOFF_HOUR, 0, 0, 0);
  return cutoff;
}

/**
 * The same-day cutoff rule (lunch before 8:00, dinner before 14:00) applies
 * symmetrically to cancelling a scheduled meal and to undoing a cancellation
 * — both are "can the kitchen still adjust for this slot" checks.
 */
function withinCutoffWindow(
  date: Date,
  mealType: MealType,
  now: Date,
  pastLabel: string,
): { ok: boolean; reason?: string } {
  const today = startOfDay(now);
  const sessionDay = startOfDay(date);

  if (sessionDay < today) {
    return { ok: false, reason: pastLabel };
  }
  if (sessionDay.getTime() === today.getTime()) {
    const cutoff = cancelCutoff(date, mealType);
    if (now >= cutoff) {
      const label = mealType === "LUNCH" ? "8:00 sáng" : "14:00";
      return { ok: false, reason: `Đã quá giờ (${label}) cho bữa ăn hôm nay.` };
    }
  }
  return { ok: true };
}

export function canCancelSession(
  session: { date: Date; mealType: MealType; status: SessionStatus },
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  if (session.status !== "SCHEDULED") {
    return { ok: false, reason: "Buổi ăn này không còn ở trạng thái có thể hủy." };
  }
  return withinCutoffWindow(session.date, session.mealType, now, "Buổi ăn đã qua, không thể hủy.");
}

/** Booking a slot follows the same cutoff as cancelling one: not in the past, and before 8:00 / 14:00 on the day itself. */
export function canBookSlot(
  slot: { date: Date; mealType: MealType },
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  return withinCutoffWindow(slot.date, slot.mealType, now, "Không thể chọn ngày đã qua.");
}

/** Undoing a cancellation is only allowed within the same window that would have allowed cancelling it. */
export function canRestoreSession(
  session: { date: Date; mealType: MealType; status: SessionStatus },
  now: Date = new Date(),
): { ok: boolean; reason?: string } {
  if (session.status !== "CANCELLED") {
    return { ok: false, reason: "Buổi ăn này không ở trạng thái đã hủy." };
  }
  return withinCutoffWindow(session.date, session.mealType, now, "Buổi ăn đã qua, không thể khôi phục.");
}
