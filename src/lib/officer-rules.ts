// Ordering rules for staff ("cán bộ") accounts. Client-safe: no Prisma import, shared by the
// officer page and the API.
//
//  - Lunch only, Monday to Friday.
//  - A week must be ordered in the week before it: the deadline is the end of the Friday before.
//  - Cancelling a single day follows the same lunch cutoff as students (see session-rules.ts).

import {
  canCancelSession,
  canRestoreSession,
  localDateKey,
  type MealType,
  type SessionStatus,
} from "@/lib/client-session-rules";

/** Price recorded for one officer lunch. */
export const OFFICER_MEAL_PRICE = 30000;

/**
 * One-off launch exception: on these days an officer's lunch can be registered, cancelled and restored all
 * day long (no 9:00 cutoff), and is not marked finished at 14:00 — the feature started mid-day. Remove the
 * date once it has passed.
 */
export const ALL_DAY_LUNCH_DATES = ["2026-10-05"];

/** Is `date` one of the launch days, and is it that day right now? */
function isAllDayLunch(date: Date, now: Date) {
  const key = localDateKey(date);
  return ALL_DAY_LUNCH_DATES.includes(key) && key === localDateKey(now);
}

type Cancellable = { date: Date; mealType: MealType; status: SessionStatus };

/** Same cutoff as students (lunch before 9:00 the same day), except on the launch day, which lasts all day. */
export function officerCanCancel(session: Cancellable, now: Date = new Date()) {
  if (session.status === "SCHEDULED" && isAllDayLunch(session.date, now)) return { ok: true as const };
  return canCancelSession(session, now);
}

/** Undoing a cancellation follows the same window as cancelling. */
export function officerCanRestore(session: Cancellable, now: Date = new Date()) {
  if (session.status === "CANCELLED" && isAllDayLunch(session.date, now)) return { ok: true as const };
  return canRestoreSession(session, now);
}

/** Number of selectable days per week (Monday to Friday). */
export const OFFICER_DAYS_PER_WEEK = 5;

export function addDaysLocal(d: Date, n: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Local-midnight Monday of the week containing `d`. */
export function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/**
 * One-off launch exception: the officer feature started mid-week, so these weeks can still be ordered
 * after the usual Friday deadline — up to the end of `until` (inclusive). Individual days must still be
 * bookable (not in the past, and today only before the lunch cutoff). Remove an entry once it has passed.
 */
const LAUNCH_WEEKS = [{ monday: "2026-10-05", until: "2026-10-06" }];

/** The Friday before `weekMonday`, at 23:59:59.999 — the last moment that week can be ordered. */
export function registrationDeadline(weekMonday: Date) {
  const launch = LAUNCH_WEEKS.find((w) => w.monday === localDateKey(weekMonday));
  if (launch) {
    const end = parseLocalDate(launch.until) ?? weekMonday;
    end.setHours(23, 59, 59, 999);
    return end;
  }
  const x = addDaysLocal(weekMonday, -3);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Monday of the one week that is currently open for ordering. */
export function openWeekMonday(now: Date = new Date()) {
  const nextWeek = addDaysLocal(mondayOf(now), 7);
  return now.getTime() <= registrationDeadline(nextWeek).getTime() ? nextWeek : addDaysLocal(nextWeek, 7);
}

/** Mondays of every week that can be ordered right now: the regular one plus any launch-exception week. */
export function openWeekMondays(now: Date = new Date()) {
  const regular = openWeekMonday(now);
  const mondays = [regular];
  for (const w of LAUNCH_WEEKS) {
    const monday = parseLocalDate(w.monday);
    if (monday && now.getTime() <= registrationDeadline(monday).getTime() && monday.getTime() !== regular.getTime()) {
      mondays.push(monday);
    }
  }
  return mondays.sort((a, b) => a.getTime() - b.getTime());
}

/** Monday to Friday of the week starting at `weekMonday`. */
export function officerWeekDays(weekMonday: Date) {
  return Array.from({ length: OFFICER_DAYS_PER_WEEK }, (_, i) => addDaysLocal(weekMonday, i));
}

/** "YYYY-MM-DD" -> local-midnight Date, or null when malformed. */
export function parseLocalDate(key: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return localDateKey(d) === key ? d : null;
}
