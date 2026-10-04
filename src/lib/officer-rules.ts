// Ordering rules for staff ("cán bộ") accounts. Client-safe: no Prisma import, shared by the
// officer page and the API.
//
//  - Lunch only, Monday to Friday.
//  - A week must be ordered in the week before it: the deadline is the end of the Friday before.
//  - Cancelling a single day follows the same lunch cutoff as students (see session-rules.ts).

import { localDateKey } from "@/lib/client-session-rules";

/** Price recorded for one officer lunch. */
export const OFFICER_MEAL_PRICE = 30000;

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

/** The Friday before `weekMonday`, at 23:59:59.999 — the last moment that week can be ordered. */
export function registrationDeadline(weekMonday: Date) {
  const x = addDaysLocal(weekMonday, -3);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Monday of the one week that is currently open for ordering. */
export function openWeekMonday(now: Date = new Date()) {
  const nextWeek = addDaysLocal(mondayOf(now), 7);
  return now.getTime() <= registrationDeadline(nextWeek).getTime() ? nextWeek : addDaysLocal(nextWeek, 7);
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
