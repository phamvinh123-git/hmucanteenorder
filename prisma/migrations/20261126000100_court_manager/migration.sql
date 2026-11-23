-- A court may have its own manager (e.g. the football pitch). Its bookings then go student union -> that manager.
ALTER TABLE "Court" ADD COLUMN "managerId" TEXT;
ALTER TABLE "Court" ADD CONSTRAINT "Court_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Waiting, passed-on and approved bookings all hold the slot.
DROP INDEX "CourtBooking_slot_date_live_key";
CREATE UNIQUE INDEX "CourtBooking_slot_date_live_key" ON "CourtBooking"("slotId", "date") WHERE "status" IN ('PENDING', 'UNION_APPROVED', 'APPROVED');
