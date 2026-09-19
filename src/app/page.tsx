import { redirect } from "next/navigation";
import { homePathForRole } from "@/lib/auth";
import { requireUser } from "@/lib/guard";

export default async function Home() {
  const user = await requireUser();
  redirect(homePathForRole(user.role));
}
