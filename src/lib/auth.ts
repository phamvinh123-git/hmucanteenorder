import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

const COOKIE_NAME = "canteen_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

/** What the login cookie holds. */
export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
};

/** The signed-in person as the rest of the site sees them: `roles` is everything they hold, read fresh from the database. */
export type Session = SessionPayload & { roles: Role[] };

export type Roles = readonly Role[];

/** Every role an account holds: its main role, the extra ones, and officer when it is flagged as one. */
export function effectiveRoles(user: { role: Role; extraRoles: Role[]; isOfficer: boolean }): Role[] {
  return Array.from(new Set<Role>([user.role, ...user.extraRoles, ...(user.isOfficer ? (["OFFICER"] as Role[]) : [])]));
}

export function hasRole(roles: Roles, ...wanted: Role[]) {
  return wanted.some((r) => roles.includes(r));
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS in production. COOKIE_SECURE=false allows logging in over plain HTTP (a test server without a certificate).
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * The signed-in person, or null. The cookie only says who it is; the roles and whether the account is still active
 * are read from the database on each call, so a role ticked or an account locked takes effect at once.
 */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  let payload: SessionPayload;
  try {
    payload = (await jwtVerify(token, secret)).payload as unknown as SessionPayload;
  } catch {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, role: true, extraRoles: true, isOfficer: true, active: true },
  });
  if (!user || !user.active) return null;
  return { userId: user.id, role: user.role, name: user.name, roles: effectiveRoles(user) };
}

/**
 * The two top roles: admin, and the head of the service team (tổ trưởng tổ dịch vụ), who runs every service. They
 * differ in one thing only: handing out and changing accounts is for admins (see canAccessAdmin).
 */
export function isTopRole(roles: Roles) {
  return hasRole(roles, "ADMIN", "SERVICE_HEAD");
}

export function canAccessSalesTools(roles: Roles) {
  return hasRole(roles, "SALES", "MANAGER") || isTopRole(roles);
}

export function canAccessStats(roles: Roles) {
  return hasRole(roles, "MANAGER") || isTopRole(roles);
}

/** The "Giá vốn" notebook: the top roles and the canteen-support staff who fill it in. */
export function canAccessCostly(roles: Roles) {
  return hasRole(roles, "CANTEEN_SUPPORT") || isTopRole(roles);
}

/** Accounts: creating, changing roles, locking, resetting passwords. Admin only. */
export function canAccessAdmin(roles: Roles) {
  return hasRole(roles, "ADMIN");
}

/** The activity log and the archives of reset data. */
export function canAccessOversight(roles: Roles) {
  return isTopRole(roles);
}

export const DEFAULT_STUDENT_PASSWORD = "123";
