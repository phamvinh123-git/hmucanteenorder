import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

const COOKIE_NAME = "canteen_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

export type SessionPayload = {
  userId: string;
  role: Role;
  name: string;
};

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
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function canAccessSalesTools(role: Role) {
  return role === "SALES" || role === "MANAGER" || role === "ADMIN";
}

export function canAccessStats(role: Role) {
  return role === "MANAGER" || role === "ADMIN";
}

export function canAccessAdmin(role: Role) {
  return role === "ADMIN";
}

export const DEFAULT_STUDENT_PASSWORD = "123";

export function homePathForRole(role: Role) {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "MANAGER":
      return "/manager";
    case "SALES":
      return "/sales";
    case "STUDENT":
      return "/student";
  }
}
