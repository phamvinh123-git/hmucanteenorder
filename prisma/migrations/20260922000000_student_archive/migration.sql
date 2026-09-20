-- CreateTable
CREATE TABLE "StudentArchive" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdByName" TEXT NOT NULL,
    "studentCount" INTEGER NOT NULL,
    "sessionCount" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "StudentArchive_pkey" PRIMARY KEY ("id")
);
