-- Fixed staff code ("mã cán bộ") of an OFFICER, an alternative login to the phone number.
ALTER TABLE "User" ADD COLUMN "staffCode" TEXT;
CREATE UNIQUE INDEX "User_staffCode_key" ON "User"("staffCode");
