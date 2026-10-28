-- "Giá vốn" (Cost Ly): ingredients, semi-finished products and recipes as JSON documents.
CREATE TABLE "CostDocument" (
    "collection" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostDocument_pkey" PRIMARY KEY ("collection","id")
);
