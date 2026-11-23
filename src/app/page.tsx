import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { COMING_SOON, servicesFor } from "@/lib/services";
import AppShell from "@/components/AppShell";

export const metadata = { title: "Dịch vụ - Phân hiệu ĐHYHN Thanh Hóa" };

// The home page: the ecosystem of services. Students and officers always see it (with what is coming); an account
// that only has one service goes straight into it.
export default async function Home() {
  const user = await requireUser();
  const services = servicesFor(user.role);
  const diner = user.role === "STUDENT" || user.role === "OFFICER";
  if (services.length === 0) redirect("/login");
  if (services.length === 1 && !diner) redirect(services[0].href);

  return (
    <AppShell role={user.role} name={user.name}>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Xin chào, {user.name}</h1>
        <p className="text-sm text-slate-500">Chọn dịch vụ bạn muốn dùng.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {services.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="group flex flex-col items-center rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md sm:p-6"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-50 to-red-100 text-4xl transition group-hover:scale-105">
              {s.icon}
            </span>
            <h2 className="mt-3 text-base font-semibold text-slate-800 group-hover:text-red-700">{s.title}</h2>
            <p className="mt-1 hidden text-xs text-slate-500 sm:block">{s.description}</p>
          </Link>
        ))}
        {COMING_SOON.map((s) => (
          <div
            key={s.key}
            aria-disabled
            className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center sm:p-6"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-4xl opacity-60">{s.icon}</span>
            <h2 className="mt-3 text-base font-semibold text-slate-500">{s.title}</h2>
            <span className="mt-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">Sắp ra mắt</span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
