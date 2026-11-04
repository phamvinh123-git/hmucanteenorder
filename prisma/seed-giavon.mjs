// Fills the "Giá vốn" notebook of one shop with the canteen's standard cốt (bán thành phẩm) and drink recipes
// (công thức), and creates every ingredient (nguyên liệu) those use, so nothing has to be typed in by hand.
//
//   node prisma/seed-giavon.mjs                      show what would be added to the first shop (changes nothing)
//   node prisma/seed-giavon.mjs --shop "Căng tin"    same, for the shop of that name
//   node prisma/seed-giavon.mjs --apply              really add them
//
// Safe to run twice: a cốt or recipe that already exists (same name) is left alone, and an ingredient is reused when
// one of the same name and unit exists. New ingredients get price 0 — fill the prices in "Giá vốn > Nguyên liệu"
// afterwards and every cốt and recipe is costed automatically. Recipe lines whose quantity is not known yet are 0:
// type the quantity where the drink uses it ("Nguyên liệu khác" is priced 1 đ per unit, so type the amount in đồng).
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const shopArg = args.includes("--shop") ? args[args.indexOf("--shop") + 1] : null;

// ---------------------------------------------------------------- cốt: [ingredient, unit, qty]; yields are in ml
const COT = [
  { name: "Cốt trà chanh", yieldQty: 1800, items: [["Trà", "g", 80], ["Nước", "ml", 2000]] },
  { name: "Cốt cà phê", yieldQty: 1000, items: [["Cà phê", "g", 800]] },
  { name: "Cốt trà olong (olong sen vàng)", yieldQty: 800, items: [["Trà", "g", 80]] },
  { name: "Cốt trà nhài sữa", yieldQty: 1200, items: [["Trà", "g", 60], ["Bột sữa", "g", 250], ["Đá", "g", 200]] },
  { name: "Cốt trà đào", yieldQty: 800, items: [["Trà", "gói", 20]] },
  {
    name: "Cốt olong nhài sữa",
    yieldQty: 1200,
    items: [["Trà", "g", 100], ["Bột sữa", "g", 100], ["Đường", "ml", 50], ["Sữa đặc", "ml", 200]],
  },
  {
    name: "Cốt trà gạo rang",
    yieldQty: 1500,
    items: [["Trà", "g", 100], ["Đường", "ml", 100], ["Bột sữa", "g", 200], ["Sữa đặc", "ml", 300]],
  },
];

// ---------------------------------------------------------------- recipe lines: ["name", "unit"] is an ingredient,
// a plain string is a cốt above, [..., qty] sets a known quantity. Quantities not given are 0 for the staff to fill in.
const OTHER = ["Nguyên liệu khác", "đ"];
const SUGAR = ["Đường", "ml"];
const RICH = ["Rich", "ml"];
const MILK = ["Sữa tươi", "ml"];
const CONDENSED = ["Sữa đặc", "ml"];

const TEA_BASE = [
  "Cốt trà chanh", ["Siro chanh", "ml"], ["Siro tắc", "ml"], ["Mãng cầu", "g"], ["Dâu tằm", "g"],
  ["Lê hoa anh đào", "g"], SUGAR, OTHER,
];
const PEACH = ["Cốt trà đào", ["Siro đào", "ml"], ["Siro cam", "ml"], ["Siro sả", "ml"], SUGAR, OTHER];
const COFFEE = ["Cốt cà phê", SUGAR, CONDENSED, RICH, ["Muối", "g"], OTHER];
const BERRY_MILK_TEA = ["Cốt trà nhài sữa", ["Siro dâu", "ml"], ["Siro việt quất", "ml"], SUGAR, ["Mứt việt quất", "ml"], OTHER];
const YOGURT_FRUIT = [
  ["Sữa chua", "hộp"], ["Siro dâu", "ml"], ["Siro việt quất", "ml"], ["Siro xoài", "ml"],
  ["Mứt dâu", "ml"], ["Mứt xoài", "ml"], ["Mứt việt quất", "ml"], RICH, OTHER,
];
const smoothie = (main) => [main, SUGAR, MILK, CONDENSED, OTHER];

const RECIPES = [
  ...["Trà chanh", "Trà tắc", "Trà mãng cầu", "Trà mãng cầu dâu tằm", "Trà lê hoa anh đào"].map((name) => ({ name, items: TEA_BASE })),
  ...["Trà đào", "Trà đào cam sả"].map((name) => ({ name, items: PEACH })),
  { name: "Trà olong sen vàng", items: ["Cốt trà olong (olong sen vàng)", ["Hạt sen", "g"], MILK, RICH, ["Bột kem cheese", "g"], OTHER] },
  ...["Cà phê nâu đá", "Cà phê đen đá", "Cà phê muối", "Bạc xỉu"].map((name) => ({ name, items: COFFEE })),
  { name: "Trà sữa hoa nhài", items: ["Cốt trà nhài sữa", SUGAR, RICH, OTHER] },
  ...["Trà sữa dâu", "Trà sữa việt quất"].map((name) => ({ name, items: BERRY_MILK_TEA })),
  { name: "Trà sữa matcha latte", items: [RICH, CONDENSED, MILK, ["Bột matcha", "g"], OTHER] },
  { name: "Olong nhài sữa", items: ["Cốt olong nhài sữa", OTHER] },
  { name: "Trà sữa gạo rang", items: ["Cốt trà gạo rang", OTHER] },
  { name: "Nước ép cam", items: [["Cam", "g"], SUGAR, OTHER] },
  { name: "Nước ép dưa hấu", items: [["Dưa hấu", "g"], SUGAR, OTHER] },
  { name: "Nước ép chanh tươi", items: [["Chanh", "ml"], SUGAR, OTHER] },
  // Bơ, xoài and mãng cầu are 100g each in a smoothie.
  { name: "Sinh tố bơ", items: smoothie(["Bơ", "g", 100]) },
  { name: "Sinh tố xoài", items: smoothie(["Xoài", "g", 100]) },
  { name: "Sinh tố mãng cầu", items: smoothie(["Mãng cầu", "g", 100]) },
  ...["Sữa chua đánh đá", "Sữa chua cà phê"].map((name) => ({ name, items: [["Sữa chua", "hộp"], MILK, CONDENSED, "Cốt cà phê", OTHER] })),
  ...["Sữa chua dâu", "Sữa chua xoài", "Sữa chua việt quất"].map((name) => ({ name, items: YOGURT_FRUIT })),
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
  const of = (collection) => docs.filter((d) => d.collection === collection).map((d) => ({ id: d.id, ...d.data }));
  const ingredients = of("ingredients");
  const batches = of("batches");
  const recipes = of("recipes");

  const writes = [];
  const ingredientId = (name, unit) => {
    const same = ingredients.find((i) => norm(i.name) === norm(name));
    if (same && same.unit === unit) return same.id;
    // Same name but another unit (e.g. sugar priced per kg): a new one, so no price is applied to the wrong unit.
    const finalName = same ? `${name} (${unit})` : name;
    const again = ingredients.find((i) => norm(i.name) === norm(finalName) && i.unit === unit);
    if (again) return again.id;
    const created = { id: randomUUID(), name: finalName, unit, price: name === OTHER[0] ? 1 : 0, packagePrice: 0, packageQty: 0 };
    ingredients.push(created);
    const { id, ...data } = created;
    writes.push({ collection: "ingredients", id, data });
    console.log(`  + nguyên liệu: ${finalName} (${unit})${same ? `   [đã có "${same.name}" tính theo ${same.unit}]` : ""}`);
    return id;
  };

  for (const cot of COT) {
    if (batches.some((b) => norm(b.name) === norm(cot.name))) {
      console.log(`= cốt ${cot.name}: đã có, bỏ qua`);
      continue;
    }
    console.log(`+ cốt ${cot.name} = ${cot.yieldQty}ml`);
    const items = cot.items.map(([name, unit, qty]) => ({ id: randomUUID(), ingredientId: ingredientId(name, unit), qty }));
    const batch = { id: randomUUID(), name: cot.name, items, yieldQty: cot.yieldQty, yieldUnit: "ml" };
    batches.push(batch);
    const { id, ...data } = batch;
    writes.push({ collection: "batches", id, data });
  }

  for (const r of RECIPES) {
    if (recipes.some((x) => norm(x.name) === norm(r.name))) {
      console.log(`= công thức ${r.name}: đã có, bỏ qua`);
      continue;
    }
    console.log(`+ công thức ${r.name} (${r.items.length} dòng)`);
    const items = r.items.map((line) => {
      if (typeof line === "string") {
        const batch = batches.find((b) => norm(b.name) === norm(line));
        if (!batch) throw new Error(`Cốt "${line}" not found`);
        return { id: randomUUID(), ingredientId: batch.id, qty: 0 };
      }
      const [name, unit, qty] = line;
      return { id: randomUUID(), ingredientId: ingredientId(name, unit), qty: qty ?? 0 };
    });
    const recipe = { id: randomUUID(), name: r.name, items };
    recipes.push(recipe);
    const { id, ...data } = recipe;
    writes.push({ collection: "recipes", id, data });
  }

  if (!apply || writes.length === 0) {
    console.log(writes.length === 0 ? "Nothing to add." : `${writes.length} documents would be added.`);
  } else {
    await prisma.$transaction(
      writes.map((w) => prisma.costDocument.create({ data: { shopId: shop.id, collection: w.collection, id: w.id, data: w.data } })),
    );
    const count = (c) => writes.filter((w) => w.collection === c).length;
    await prisma.activityLog.create({
      data: {
        userId: null,
        action: "COSTLY_ADD",
        detail: `Giá vốn: thêm vào cơ sở "${shop.name}" ${count("ingredients")} nguyên liệu, ${count("batches")} cốt, ${count("recipes")} công thức`,
      },
    });
    console.log(`Added ${writes.length} documents.`);
  }
} finally {
  await prisma.$disconnect();
}
