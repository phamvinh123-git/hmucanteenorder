-- What sport a court is (drives its 3D picture) and the weekdays it is lent out (0 = Sunday ... 6 = Saturday).
ALTER TABLE "Court" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Court" ADD COLUMN "openDays" INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6];
