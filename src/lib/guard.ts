import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { effectiveRoles, getSession } from "@/lib/auth";
import { homeFor } from "@/lib/services";
import { Role } from "@prisma/client";

/**
 * The signed-in account for a page, with `roles` (everything it holds). With `roles` in the options the page is
 * for accounts holding at least one of them; anyone else is sent to the first service they do have.
 */
export async function requireUser(options?: { roles?: Role[]; allowPendingPasswordChange?: boolean }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) redirect("/login");

  if (user.mustChangePassword && !options?.allowPendingPasswordChange) {
    redirect("/change-password");
  }

  const roles = effectiveRoles(user);
  if (options?.roles && !options.roles.some((r) => roles.includes(r))) {
    redirect(homeFor(roles));
  }

  return { ...user, roles };
}
