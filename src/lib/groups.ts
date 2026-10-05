import type { Prisma } from "@prisma/client";

export type DinerGroup = "ALL" | "OFFICER" | "STUDENT";

/**
 * Who counts as an officer ("cán bộ") is the `isOfficer` flag, not the role: a manager, salesperson or admin
 * can also be an officer and order lunch with the same login. Students are the accounts with role STUDENT.
 */
export function dinerWhere(group: DinerGroup): Prisma.UserWhereInput {
  if (group === "OFFICER") return { isOfficer: true };
  if (group === "STUDENT") return { role: "STUDENT" };
  return { OR: [{ role: "STUDENT" }, { isOfficer: true }] };
}

export function parseGroup(value: string | null | undefined, fallback: DinerGroup = "ALL"): DinerGroup {
  return value === "OFFICER" || value === "STUDENT" || value === "ALL" ? value : fallback;
}
