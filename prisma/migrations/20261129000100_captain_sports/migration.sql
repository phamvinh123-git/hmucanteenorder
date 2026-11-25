-- The sports (court kinds) a club captain applies for.
ALTER TABLE "User" ADD COLUMN "captainSports" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
