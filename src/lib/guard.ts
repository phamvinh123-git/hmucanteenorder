import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession, homePathForRole } from "@/lib/auth";
import { Role } from "@prisma/client";

export async function requireUser(options?: { roles?: Role[]; allowPendingPasswordChange?: boolean }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) redirect("/login");

  if (user.mustChangePassword && !options?.allowPendingPasswordChange) {
    redirect("/change-password");
  }

  if (options?.roles && !options.roles.includes(user.role)) {
    redirect(homePathForRole(user.role));
  }

  return user;
}
