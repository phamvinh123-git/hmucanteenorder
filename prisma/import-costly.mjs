// Imports the data of the old standalone Cost Ly app into the canteen's "Giá vốn" notebook.
//
// The old app kept one JSON document per ingredient / semi-finished product / recipe in a table called
// "documents" (columns tenant, collection, id, data), one set per shop (tenant). Export that table to a file
// (see deploy/CHUYEN-COST-LY.md), then:
//
//   node prisma/import-costly.mjs costly.json                    show what the file holds (changes nothing)
//   node prisma/import-costly.mjs costly.json --tenant chuquan   show what would be imported for that shop
//   node prisma/import-costly.mjs costly.json --tenant chuquan --apply   really import it
//
// Existing documents with the same collection and id are overwritten, so it is safe to run twice.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--tenant");
const tenantArg = args.includes("--tenant") ? args[args.indexOf("--tenant") + 1] : null;
const apply = args.includes("--apply");
const COLLECTIONS = new Set(["ingredients", "batches", "recipes"]);

if (!file) {
  console.error("Usage: node prisma/import-costly.mjs <file.json> [--tenant <name>] [--apply]");
  process.exit(1);
}

let rows;
try {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "").trim();
  rows = JSON.parse(text);
} catch (err) {
  console.error("Cannot read the file as JSON:", err.message);
  process.exit(1);
}
if (!Array.isArray(rows)) {
  console.error("The file must contain a JSON array of { tenant, collection, id, data } rows.");
  process.exit(1);
}

// What is in the file, per shop
const byTenant = new Map();
for (const r of rows) {
  if (!r || !COLLECTIONS.has(r.collection) || typeof r.id !== "string" || typeof r.data !== "object" || !r.data) continue;
  const t = r.tenant ?? "";
  const counts = byTenant.get(t) ?? { ingredients: 0, batches: 0, recipes: 0 };
  counts[r.collection] += 1;
  byTenant.set(t, counts);
}
console.log(`File: ${file} — ${rows.length} rows`);
for (const [t, c] of byTenant) {
  console.log(`  shop "${t}": ${c.ingredients} nguyên liệu, ${c.batches} bán thành phẩm, ${c.recipes} công thức`);
}
if (byTenant.size === 0) {
  console.error("Nothing usable in the file.");
  process.exit(1);
}

const tenant = tenantArg ?? (byTenant.size === 1 ? [...byTenant.keys()][0] : null);
if (!tenant) {
  console.log('\nThe file holds several shops. Pick one with --tenant "<name>" (the shop whose data you want in the canteen).');
  process.exit(0);
}
if (!byTenant.has(tenant)) {
  console.error(`No shop called "${tenant}" in the file.`);
  process.exit(1);
}

const docs = rows.filter(
  (r) => (r.tenant ?? "") === tenant && COLLECTIONS.has(r.collection) && typeof r.id === "string" && r.data && typeof r.data === "object",
);
console.log(`\nShop "${tenant}": ${docs.length} documents to import.`);
if (!apply) {
  console.log("(dry run — nothing written. Add --apply to import.)");
  process.exit(0);
}

const prisma = new PrismaClient();
try {
  let done = 0;
  for (let i = 0; i < docs.length; i += 200) {
    const chunk = docs.slice(i, i + 200);
    await prisma.$transaction(
      chunk.map((d) => {
        // The id lives in the key, not in the stored data.
        const { id: _ignored, ...data } = d.data;
        return prisma.costDocument.upsert({
          where: { collection_id: { collection: d.collection, id: d.id } },
          create: { collection: d.collection, id: d.id, data },
          update: { data },
        });
      }),
    );
    done += chunk.length;
  }
  await prisma.activityLog.create({
    data: { userId: null, action: "COSTLY_IMPORT", detail: `Nhập dữ liệu Cost Ly cũ (quán "${tenant}"): ${done} mục` },
  });
  console.log(`Imported ${done} documents into the canteen's Giá vốn notebook.`);
} finally {
  await prisma.$disconnect();
}
