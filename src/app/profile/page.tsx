import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const user = await requireUser();

  return (
    <AppShell role={user.role} name={user.name}>
      <ProfileForm
        role={user.role}
        initial={{
          name: user.name,
          phone: user.phone,
          orderCode: user.orderCode,
          major: user.major,
          className: user.className,
        }}
      />
    </AppShell>
  );
}
