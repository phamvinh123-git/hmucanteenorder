import { addDays, startOfDay } from "date-fns";
import { localDateKey } from "@/lib/client-session-rules";
import { hasRole, isTopRole, type Roles } from "@/lib/auth";

/** How far ahead a court can be booked, in days from today. */
export const COURT_BOOK_DAYS_AHEAD = 14;

export type CourtStatus = "PENDING" | "UNION_APPROVED" | "APPROVED" | "REJECTED" | "CANCELLED";
/** Statuses that hold a slot: waiting for the union, passed on to the court's manager, approved. */
export const LIVE_STATUSES: CourtStatus[] = ["PENDING", "UNION_APPROVED", "APPROVED"];

type Actor = { userId: string; roles: Roles };
/** A court has its own manager (e.g. the football pitch) or none (the student union manages it). */
type CourtRef = { managerId: string | null };

/**
 * Who may book courts: students (their bookings wait for approval), the student union, court managers, and the top
 * roles. Officers and the other roles do not use this service.
 */
export function courtBookingMode(roles: Roles): "approval" | "instant" | null {
  if (isTopRole(roles) || hasRole(roles, "COURT_MANAGER", "UNION")) return "instant";
  if (hasRole(roles, "STUDENT")) return "approval";
  return null;
}

/**
 * Where a new booking starts. The top roles and court managers are approved at once. The student union's own
 * booking skips its own step. Everyone else waits for the student union.
 */
export function initialBookingStatus(roles: Roles, court: CourtRef): "PENDING" | "UNION_APPROVED" | "APPROVED" {
  if (isTopRole(roles) || hasRole(roles, "COURT_MANAGER")) return "APPROVED";
  if (hasRole(roles, "UNION")) return court.managerId ? "UNION_APPROVED" : "APPROVED";
  return "PENDING";
}

/** The status a booking takes when the current step approves it: the union passes it on to the court's manager. */
export function statusAfterApproval(status: "PENDING" | "UNION_APPROVED", court: CourtRef): "UNION_APPROVED" | "APPROVED" {
  return status === "PENDING" && court.managerId ? "UNION_APPROVED" : "APPROVED";
}

/** Can this person decide the booking in its current step? Union: waiting bookings. Court manager: passed-on ones. */
export function canDecideStep(actor: Actor, court: CourtRef, status: CourtStatus) {
  if (isTopRole(actor.roles)) return status === "PENDING" || status === "UNION_APPROVED";
  if (status === "PENDING") return hasRole(actor.roles, "UNION");
  if (status === "UNION_APPROVED") return !!court.managerId && court.managerId === actor.userId;
  return false;
}

/**
 * Who sets up a court's slots and can cancel its bookings: the top roles (all courts), the student union (courts
 * without a manager) and a court manager (the courts they manage).
 */
export function canManageCourt(actor: Actor, court: CourtRef) {
  if (isTopRole(actor.roles)) return true;
  if (hasRole(actor.roles, "UNION") && !court.managerId) return true;
  return hasRole(actor.roles, "COURT_MANAGER") && court.managerId === actor.userId;
}

/** Has a court-related duty (shows the approvals and set-up tabs). */
export function canApproveCourts(roles: Roles) {
  return hasRole(roles, "UNION", "COURT_MANAGER") || isTopRole(roles);
}

export function canManageCourts(roles: Roles) {
  return canApproveCourts(roles);
}

/** The top roles and the student union add courts; the top roles also choose each court's manager. */
export function canAddCourts(roles: Roles) {
  return hasRole(roles, "UNION") || isTopRole(roles);
}

export function canAssignCourtManagers(roles: Roles) {
  return isTopRole(roles);
}

export function canUseCourts(roles: Roles) {
  return courtBookingMode(roles) !== null || canApproveCourts(roles);
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
