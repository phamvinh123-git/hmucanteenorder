import { addDays, startOfDay } from "date-fns";
import { Role } from "@prisma/client";
import { localDateKey } from "@/lib/client-session-rules";

/** How far ahead a court can be booked, in days from today. */
export const COURT_BOOK_DAYS_AHEAD = 14;

/**
 * How an account books a court: "approval" (the booking waits for the student union), "instant" (approved at
 * once), or null (no access). One place to change who may book.
 */
export function courtBookingMode(role: Role): "approval" | "instant" | null {
  switch (role) {
    case "STUDENT":
      return "approval";
    case "OFFICER":
    case "MANAGER":
    case "ADMIN":
    case "UNION":
      return "instant";
    default:
      return null;
  }
}

/** The student union (and admins) approve or reject students' bookings. */
export function canApproveCourts(role: Role) {
  return role === "UNION" || role === "ADMIN";
}

/** Admins set up the courts and their slots. */
export function canManageCourts(role: Role) {
  return role === "ADMIN";
}

export function canUseCourts(role: Role) {
  return courtBookingMode(role) !== null || canApproveCourts(role);
}

/** "2026-11-23" (a day as the website shows it everywhere) to that local day's midnight, or null if invalid. */
export function parseDayKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return localDateKey(d) === key ? d : null;
}

/** The moment a slot starts: the day plus its "HH:mm". */
export function slotStartsAt(day: Date, startTime: string) {
  const [h, m] = startTime.split(":").map(Number);
  const at = startOfDay(day);
  at.setHours(h, m, 0, 0);
  return at;
}

/** The days that can be booked: today up to the limit. */
export function bookableRange(now: Date = new Date()) {
  const first = startOfDay(now);
  return { first, last: addDays(first, COURT_BOOK_DAYS_AHEAD) };
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
