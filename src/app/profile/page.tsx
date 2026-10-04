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
          // An officer without a phone number of their own has the staff code as a placeholder; show it blank.
          phone: user.staffCode && user.phone === user.staffCode ? "" : user.phone,
          staffCode: user.staffCode,
          orderCode: user.orderCode,
          major: user.major,
          className: user.className,
        }}
      />
    </AppShell>
  );
}
