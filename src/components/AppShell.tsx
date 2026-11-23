import Link from "next/link";
import Image from "next/image";
import AppNav, { MobileTabs, type NavGroup } from "./AppNav";
import UserMenu from "./UserMenu";
import IdleScreen from "./IdleScreen";
import { Role } from "@prisma/client";
import { servicesFor } from "@/lib/services";
import { ROLE_LABEL } from "@/lib/roles";

export default async function AppShell({
  roles,
  name,
  children,
}: {
  roles: Role[];
  name: string;
  children: React.ReactNode;
}) {
  // The services this account uses; the menu (and the tabs inside the current service) is built from them.
  const groups: NavGroup[] = servicesFor(roles).map((svc) => ({
    key: svc.key,
    title: svc.title,
    icon: svc.icon,
    href: svc.href,
    paths: svc.paths,
    items: svc.items,
  }));

  return (
    <div className="min-h-screen">
      <IdleScreen />
      <header className="print:hidden sticky top-0 z-30 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
        <div className="h-1 bg-gradient-to-r from-red-700 via-red-400 to-red-700" />
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 py-2">
          <Link href="/" className="flex flex-shrink-0 items-center gap-3">
            <Image
              src="/logo.webp"
              alt="Đại học Y Hà Nội - Phân hiệu Thanh Hóa"
              width={44}
              height={44}
              className="h-10 w-10 flex-shrink-0 rounded-full object-cover bg-white animate-logo-glow logo-spin-hover"
            />
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-bold text-red-700">Căng tin Phân hiệu</span>
              <span className="block text-xs text-slate-500">ĐHYHN Thanh Hóa</span>
            </span>
          </Link>
          <AppNav groups={groups} />
          <div className="ml-auto">
            <UserMenu name={name} roleLabel={roles.map((r) => ROLE_LABEL[r]).slice(0, 2).join(" · ")} />
          </div>
        </div>
        <MobileTabs groups={groups} />
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6 animate-rise-in">
        {children}
      </main>
    </div>
  );
}
