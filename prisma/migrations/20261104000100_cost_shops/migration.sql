-- "Giá vốn" keeps one notebook per shop (cơ sở). Everything entered so far goes into the first shop.
CREATE TABLE "CostShop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostShop_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CostShop_name_key" ON "CostShop"("name");

INSERT INTO "CostShop" ("id", "name") VALUES ('default', 'Căng tin');

ALTER TABLE "CostDocument" ADD COLUMN "shopId" TEXT NOT NULL DEFAULT 'default';
ALTER TABLE "CostDocument" ALTER COLUMN "shopId" DROP DEFAULT;
ALTER TABLE "CostDocument" DROP CONSTRAINT "CostDocument_pkey";
ALTER TABLE "CostDocument" ADD CONSTRAINT "CostDocument_pkey" PRIMARY KEY ("shopId", "collection", "id");
ALTER TABLE "CostDocument" ADD CONSTRAINT "CostDocument_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "CostShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
