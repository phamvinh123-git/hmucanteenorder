import { addDays, startOfDay } from "date-fns";
import { Role } from "@prisma/client";
import { localDateKey } from "@/lib/client-session-rules";
import { isTopRole } from "@/lib/auth";

/** How far ahead a court can be booked, in days from today. */
export const COURT_BOOK_DAYS_AHEAD = 14;

export type CourtStatus = "PENDING" | "UNION_APPROVED" | "APPROVED" | "REJECTED" | "CANCELLED";
/** Statuses that hold a slot: waiting for the union, passed on to the court's manager, approved. */
export const LIVE_STATUSES: CourtStatus[] = ["PENDING", "UNION_APPROVED", "APPROVED"];

type Actor = { userId: string; role: Role };
/** A court has its own manager (e.g. the football pitch) or none (the student union manages it). */
type CourtRef = { managerId: string | null };

/** Who may book courts at all ("approval" / "instant" only hint at the usual path; see initialBookingStatus). */
export function courtBookingMode(role: Role): "approval" | "instant" | null {
  switch (role) {
    case "STUDENT":
      return "approval";
    case "OFFICER":
    case "MANAGER":
    case "ADMIN":
    case "SERVICE_HEAD":
    case "COURT_MANAGER":
    case "UNION":
      return "instant";
    default:
      return null;
  }
}

/**
 * Where a new booking starts. Admin, the head of the service team and court managers are approved at once. The
 * student union's own booking skips its own step. A student (and, on a court that has a manager, anyone else)
 * waits for the student union.
 */
export function initialBookingStatus(role: Role, court: CourtRef): "PENDING" | "UNION_APPROVED" | "APPROVED" {
  if (isTopRole(role) || role === "COURT_MANAGER") return "APPROVED";
  if (role === "UNION") return court.managerId ? "UNION_APPROVED" : "APPROVED";
  if (role === "STUDENT") return "PENDING";
  return court.managerId ? "PENDING" : "APPROVED";
}

/** The status a booking takes when the current step approves it: the union passes it on to the court's manager. */
export function statusAfterApproval(status: "PENDING" | "UNION_APPROVED", court: CourtRef): "UNION_APPROVED" | "APPROVED" {
  return status === "PENDING" && court.managerId ? "UNION_APPROVED" : "APPROVED";
}

/** Can this person decide the booking in its current step? Union: waiting bookings. Court manager: passed-on ones. */
export function canDecideStep(actor: Actor, court: CourtRef, status: CourtStatus) {
  if (isTopRole(actor.role)) return status === "PENDING" || status === "UNION_APPROVED";
  if (status === "PENDING") return actor.role === "UNION";
  if (status === "UNION_APPROVED") return !!court.managerId && court.managerId === actor.userId;
  return false;
}

/**
 * Who sets up a court's slots and can cancel its bookings: admin and the head of the service team (all courts),
 * the student union (courts without a manager) and a court manager (the courts they manage).
 */
export function canManageCourt(actor: Actor, court: CourtRef) {
  if (isTopRole(actor.role)) return true;
  if (actor.role === "UNION") return !court.managerId;
  return actor.role === "COURT_MANAGER" && court.managerId === actor.userId;
}

/** Has a court-related duty (shows the approvals and set-up tabs). */
export function canApproveCourts(role: Role) {
  return role === "UNION" || role === "COURT_MANAGER" || isTopRole(role);
}

export function canManageCourts(role: Role) {
  return canApproveCourts(role);
}

/** Admin and the head of the service team add courts and choose each court's manager. */
export function canAssignCourtManagers(role: Role) {
  return isTopRole(role);
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
