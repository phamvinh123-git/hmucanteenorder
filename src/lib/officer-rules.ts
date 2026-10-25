// Ordering rules for staff ("cán bộ") accounts. Client-safe: no Prisma import, shared by the
// officer page and the API.
//
//  - Lunch only, Monday to Friday.
//  - A week can be ordered until 9:00 on its own Monday (the lunch cutoff of that Monday), and it opens a week ahead.
//  - Cancelling a single day follows the same lunch cutoff as students (see session-rules.ts).

import {
  canBookSlot,
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
export const ALL_DAY_LUNCH_DATES = ["2026-10-05", "2026-10-12"];

/** Is `date` one of the launch days, and is it that day right now? */
function isAllDayLunch(date: Date, now: Date) {
  const key = localDateKey(date);
  return ALL_DAY_LUNCH_DATES.includes(key) && key === localDateKey(now);
}

type Cancellable = { date: Date; mealType: MealType; status: SessionStatus };

/**
 * One-off: on these days the lunch of that same day can still be added or dropped until the given hour (instead of
 * the usual 9:00), because registration was extended. Remove an entry once it has passed.
 */
const LUNCH_BOOK_UNTIL_HOUR: Record<string, number> = { "2026-10-19": 10 };

/** Can this lunch still be added or dropped? Same cutoff as students, except on a launch day, which lasts all day. */
export function officerCanBook(slot: { date: Date; mealType: MealType }, now: Date = new Date()) {
  if (slot.mealType === "LUNCH" && isAllDayLunch(slot.date, now)) return { ok: true as const };
  const key = localDateKey(slot.date);
  const until = LUNCH_BOOK_UNTIL_HOUR[key];
  if (slot.mealType === "LUNCH" && until !== undefined && key === localDateKey(now) && now.getHours() < until) {
    return { ok: true as const };
  }
  return canBookSlot(slot, now);
}

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

/** Hour (local time) on a week's own Monday at which ordering that week closes. */
export const REGISTRATION_DEADLINE_HOUR = 9;

/**
 * One-off exceptions: these weeks can still be ordered after the usual deadline — up to the end of
 * `until` (inclusive), or up to `untilTime` ("HH:MM") on that day when given. Individual days must still be
 * bookable (not in the past, and today only before the lunch cutoff). Remove an entry once it has passed.
 */
const LAUNCH_WEEKS: { monday: string; until: string; untilTime?: string }[] = [];

/** 9:00 on `weekMonday` itself — the last moment that week can be ordered. */
export function registrationDeadline(weekMonday: Date) {
  const launch = LAUNCH_WEEKS.find((w) => w.monday === localDateKey(weekMonday));
  if (launch) {
    const end = parseLocalDate(launch.until) ?? weekMonday;
    const time = launch.untilTime ? /^(\d{1,2}):(\d{2})$/.exec(launch.untilTime) : null;
    if (time) end.setHours(Number(time[1]), Number(time[2]), 0, 0);
    else end.setHours(23, 59, 59, 999);
    return end;
  }
  const x = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate());
  x.setHours(REGISTRATION_DEADLINE_HOUR, 0, 0, 0);
  return x;
}

/**
 * Mondays of every week that can be ordered right now. The next week is open for the whole of this week; the
 * current week stays open until 9:00 on its Monday, so on a Monday morning both are. Any launch-exception week
 * is added too.
 */
export function openWeekMondays(now: Date = new Date()) {
  const thisMonday = mondayOf(now);
  const mondays = [thisMonday, addDaysLocal(thisMonday, 7)].filter((m) => now.getTime() <= registrationDeadline(m).getTime());
  for (const w of LAUNCH_WEEKS) {
    const monday = parseLocalDate(w.monday);
    if (monday && now.getTime() <= registrationDeadline(monday).getTime() && !mondays.some((m) => m.getTime() === monday.getTime())) {
      mondays.push(monday);
    }
  }
  return mondays.sort((a, b) => a.getTime() - b.getTime());
}

/** Monday of the next week that can be ordered right now (the last one in `openWeekMondays`). */
export function openWeekMonday(now: Date = new Date()) {
  const open = openWeekMondays(now);
  return open[open.length - 1];
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
