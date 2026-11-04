// Adds the canteen's standard cốt (semi-finished products) to the "Giá vốn" notebook of one shop.
//
//   node prisma/add-cot.mjs                      show what would be added to the first shop (changes nothing)
//   node prisma/add-cot.mjs --shop "Căng tin"    same, for the shop of that name
//   node prisma/add-cot.mjs --apply              really add them
//
// Safe to run twice: a cốt that already exists (same name) is left alone, and an ingredient is reused when one of the
// same name and unit exists. New ingredients get price 0 — fill the prices in "Giá vốn > Nguyên liệu" afterwards, and
// every cốt's cost is then computed automatically.
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const shopArg = args.includes("--shop") ? args[args.indexOf("--shop") + 1] : null;

// name, unit, quantity — quantities are in the ingredient's unit; yields are in ml.
const COT = [
  { name: "Cốt trà chanh", yieldQty: 1800, items: [["Trà chanh", "g", 80], ["Nước", "ml", 2000]] },
  { name: "Cốt cà phê", yieldQty: 1000, items: [["Cà phê", "g", 800]] },
  { name: "Cốt trà olong (olong sen vàng)", yieldQty: 800, items: [["Trà olong", "g", 80]] },
  { name: "Cốt trà nhài sữa", yieldQty: 1200, items: [["Trà nhài", "g", 60], ["Bột sữa", "g", 250], ["Đá", "g", 200]] },
  { name: "Cốt trà đào", yieldQty: 800, items: [["Trà đào (túi lọc)", "gói", 20]] },
  {
    name: "Cốt olong nhài sữa",
    yieldQty: 1200,
    items: [["Trà olong nhài", "g", 100], ["Bột sữa", "g", 100], ["Đường", "ml", 50], ["Sữa đặc", "g", 200]],
  },
  {
    name: "Cốt trà gạo rang",
    yieldQty: 1500,
    items: [["Trà gạo rang", "g", 100], ["Đường", "ml", 100], ["Bột sữa", "g", 200], ["Sữa đặc", "g", 300]],
  },
];

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();

const prisma = new PrismaClient();
try {
  const shop = shopArg
    ? await prisma.costShop.findUnique({ where: { name: shopArg } })
    : await prisma.costShop.findFirst({ orderBy: { createdAt: "asc" } });
  if (!shop) {
    console.error(shopArg ? `No shop called "${shopArg}".` : "No shop yet.");
    process.exit(1);
  }
  console.log(`Shop: "${shop.name}"${apply ? "" : "  (dry run — nothing written; add --apply)"}`);

  const docs = await prisma.costDocument.findMany({ where: { shopId: shop.id } });
  const ingredients = docs.filter((d) => d.collection === "ingredients").map((d) => ({ id: d.id, ...d.data }));
  const batches = docs.filter((d) => d.collection === "batches").map((d) => ({ id: d.id, ...d.data }));

  const writes = [];
  const ingredientId = (name, unit) => {
    const same = ingredients.find((i) => norm(i.name) === norm(name));
    if (same && same.unit === unit) return same.id;
    // Same name but another unit (e.g. sugar priced per kg): a new one, so no price is applied to the wrong unit.
    const finalName = same ? `${name} (${unit})` : name;
    const again = ingredients.find((i) => norm(i.name) === norm(finalName) && i.unit === unit);
    if (again) return again.id;
    const created = { id: randomUUID(), name: finalName, unit, price: 0, packagePrice: 0, packageQty: 0 };
    ingredients.push(created);
    const { id, ...data } = created;
    writes.push({ collection: "ingredients", id, data });
    console.log(`  + nguyên liệu: ${finalName} (${unit}), giá 0${same ? `   [đã có "${same.name}" tính theo ${same.unit}]` : ""}`);
    return id;
  };

  for (const cot of COT) {
    if (batches.some((b) => norm(b.name) === norm(cot.name))) {
      console.log(`= ${cot.name}: đã có, bỏ qua`);
      continue;
    }
    console.log(`+ ${cot.name} = ${cot.yieldQty}ml`);
    const items = cot.items.map(([name, unit, qty]) => ({ id: randomUUID(), ingredientId: ingredientId(name, unit), qty }));
    const { id, ...data } = { id: randomUUID(), name: cot.name, items, yieldQty: cot.yieldQty, yieldUnit: "ml" };
    writes.push({ collection: "batches", id, data });
  }

  if (!apply || writes.length === 0) {
    console.log(writes.length === 0 ? "Nothing to add." : `${writes.length} documents would be added.`);
  } else {
    await prisma.$transaction(
      writes.map((w) => prisma.costDocument.create({ data: { shopId: shop.id, collection: w.collection, id: w.id, data: w.data } })),
    );
    await prisma.activityLog.create({
      data: { userId: null, action: "COSTLY_ADD", detail: `Giá vốn: thêm ${COT.length} cốt chuẩn vào cơ sở "${shop.name}" (${writes.length} mục)` },
    });
    console.log(`Added ${writes.length} documents.`);
  }
} finally {
  await prisma.$disconnect();
}
