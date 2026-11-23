import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import { canApproveCourts, canManageCourts, courtBookingMode } from "@/lib/courts";
import CourtsApp from "./CourtsApp";

export const metadata = { title: "Đặt sân - Phân hiệu ĐHYHN Thanh Hóa" };

// "Đặt sân": book a court slot. Students' bookings wait for the student union; the union and admins approve them.
export default async function CourtsPage() {
  const user = await requireUser({ roles: ["STUDENT", "OFFICER", "MANAGER", "ADMIN", "SERVICE_HEAD", "COURT_MANAGER", "UNION"] });

  return (
    <AppShell role={user.role} name={user.name}>
      <CourtsApp
        mode={courtBookingMode(user.role)}
        canApprove={canApproveCourts(user.role)}
        canManage={canManageCourts(user.role)}
      />
    </AppShell>
  );
}
