-- Department ("phòng ban") of an officer, and automatic weekly lunch registration for chosen officers.
-- autoRegisteredWeek is the Monday of the last week that was filled in automatically, so a day the officer
-- later drops is not put back.
ALTER TABLE "User" ADD COLUMN "department" TEXT;
ALTER TABLE "User" ADD COLUMN "autoRegister" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "autoRegisteredWeek" TIMESTAMP(3);
