import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Giá vốn - Căng tin ĐHYHN Thanh Hóa" };

// "Giá vốn" (Cost Ly): the cost notebook, inside the canteen with the same login. Managers and admins only.
export default async function CostlyPage() {
  const user = await requireUser({ roles: ["MANAGER", "ADMIN"] });

  return (
    <AppShell role={user.role} name={user.name}>
      <iframe
        src="/costly-app/index.html"
        title="Giá vốn (Cost Ly)"
        className="block w-full rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ height: "calc(100vh - 150px)", minHeight: 640 }}
      />
    </AppShell>
  );
}
