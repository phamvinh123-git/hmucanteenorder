-- A person can be an officer (cán bộ) on top of a manager/sales/admin account, with one login.
ALTER TABLE "User" ADD COLUMN "isOfficer" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isOfficer" = true WHERE "role" = 'OFFICER';
