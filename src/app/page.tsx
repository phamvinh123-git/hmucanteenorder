import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { servicesFor } from "@/lib/services";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Dịch vụ - Phân hiệu ĐHYHN Thanh Hóa" };

// The home page: the services this account may open. An account with a single service goes straight into it.
export default async function Home() {
  const user = await requireUser();
  const services = servicesFor(user.role);
  if (services.length === 0) redirect("/login");
  if (services.length === 1) redirect(services[0].href);

  return (
    <AppShell role={user.role} name={user.name}>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-800">Xin chào, {user.name}</h1>
        <p className="text-sm text-slate-500">Chọn dịch vụ bạn muốn dùng.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-2xl">{s.icon}</span>
            <h2 className="mt-3 text-lg font-semibold text-slate-800 group-hover:text-red-700">{s.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{s.description}</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
