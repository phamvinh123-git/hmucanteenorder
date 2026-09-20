-- Replace the informational "group" (Tổ) column with major (Ngành) and class (Lớp).
ALTER TABLE "User" DROP COLUMN "group",
ADD COLUMN "major" TEXT,
ADD COLUMN "className" TEXT;
