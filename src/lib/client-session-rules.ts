// Client-safe copy of the cancellation-deadline rule (no @prisma/client import,
// so this can be bundled into "use client" components).

export const LUNCH_CUTOFF_HOUR = 8;
export const DINNER_CUTOFF_HOUR = 14;
export const LOW_MEAL_THRESHOLD = 4;

export type MealType = "LUNCH" | "DINNER";
export type SessionStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * "YYYY-MM-DD" using the LOCAL calendar day (never `toISOString()`, which is
 * UTC and drifts a day off in timezones like Asia/Ho_Chi_Minh, especially in
 * the early-morning hours).
 */
export function localDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * One-off launch exception: on these days the dinner can still be cancelled until it is
 * marked finished (20:00) instead of the usual 14:00. Remove the date once it has passed.
 */
const DINNER_LATE_CANCEL_DATES = ["2026-09-21"];
const DINNER_LATE_CANCEL_HOUR = 20;

/** From this date the cancellation deadlines move to 9:00 (lunch) and 15:00 (dinner). */
const NEW_CUTOFF_FROM = "2026-09-22";
const LUNCH_CUTOFF_HOUR_NEW = 9;
const DINNER_CUTOFF_HOUR_NEW = 15;

export function cancelCutoff(sessionDate: Date, mealType: MealType) {
  const cutoff = startOfDayLocal(sessionDate);
  const key = localDateKey(sessionDate);
  const isNew = key >= NEW_CUTOFF_FROM;
  const lateDinner = mealType === "DINNER" && DINNER_LATE_CANCEL_DATES.includes(key);
  const hour =
    mealType === "LUNCH"
      ? isNew
        ? LUNCH_CUTOFF_HOUR_NEW
        : LUNCH_CUTOFF_HOUR
      : lateDinner
        ? DINNER_LATE_CANCEL_HOUR
        : isNew
          ? DINNER_CUTOFF_HOUR_NEW
          : DINNER_CUTOFF_HOUR;
  cutoff.setHours(hour, 0, 0, 0);
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
  const today = startOfDayLocal(now);
  const sessionDay = startOfDayLocal(date);

  if (sessionDay < today) {
    return { ok: false, reason: pastLabel };
  }
  if (sessionDay.getTime() === today.getTime()) {
    const cutoff = cancelCutoff(date, mealType);
    if (now >= cutoff) {
      const label = `${cutoff.getHours()}h00`;
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
