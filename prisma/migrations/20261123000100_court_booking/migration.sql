-- Court booking ("Đặt sân"): courts, their fixed time slots, and bookings.
CREATE TYPE "CourtBookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Court_name_key" ON "Court"("name");

CREATE TABLE "CourtSlot" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CourtSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourtSlot_courtId_startTime_key" ON "CourtSlot"("courtId", "startTime");

CREATE TABLE "CourtBooking" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CourtBookingStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtBooking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourtBooking_date_idx" ON "CourtBooking"("date");
CREATE INDEX "CourtBooking_userId_idx" ON "CourtBooking"("userId");

-- A slot on a day holds at most one live (waiting or approved) booking; rejected and cancelled ones free it.
CREATE UNIQUE INDEX "CourtBooking_slot_date_live_key" ON "CourtBooking"("slotId", "date") WHERE "status" IN ('PENDING', 'APPROVED');

ALTER TABLE "CourtSlot" ADD CONSTRAINT "CourtSlot_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourtBooking" ADD CONSTRAINT "CourtBooking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourtBooking" ADD CONSTRAINT "CourtBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "CourtSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourtBooking" ADD CONSTRAINT "CourtBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourtBooking" ADD CONSTRAINT "CourtBooking_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
