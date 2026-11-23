import { requireUser } from "@/lib/guard";
import AppShell from "@/components/AppShell";
import { canAddCourts, canApproveCourts, canManageCourts, courtBookingMode } from "@/lib/courts";
import CourtsApp from "./CourtsApp";

export const metadata = { title: "Đặt sân - Phân hiệu ĐHYHN Thanh Hóa" };

// "Đặt sân": book a court slot. Students' bookings wait for the student union; the union and admins approve them.
export default async function CourtsPage() {
  const user = await requireUser({ roles: ["STUDENT", "ADMIN", "SERVICE_HEAD", "COURT_MANAGER", "UNION"] });

  return (
    <AppShell roles={user.roles} name={user.name}>
      <CourtsApp
        mode={courtBookingMode(user.roles)}
        canApprove={canApproveCourts(user.roles)}
        canManage={canManageCourts(user.roles)}
        canAddCourt={canAddCourts(user.roles)}
      />
    </AppShell>
  );
}
