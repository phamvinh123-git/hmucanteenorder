import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import PrintButton from "./PrintButton";
import { isPremiumPrice } from "@/lib/pricing";

const MEAL_LABEL: Record<string, string> = { LUNCH: "Trưa", DINNER: "Tối" };
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

function sortByOrderCode(a: { orderCode: number | null; name: string }, b: { orderCode: number | null; name: string }) {
  if (a.orderCode != null && b.orderCode != null) return a.orderCode - b.orderCode;
  if (a.orderCode != null) return -1;
  if (b.orderCode != null) return 1;
  return a.name.localeCompare(b.name, "vi");
}

export default async function SchedulePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; mealType?: string }>;
}) {
  await requireUser({ roles: ["SALES", "MANAGER", "ADMIN"] });

  const { date: dateParam, mealType: mealTypeParam } = await searchParams;
  const mealType = mealTypeParam === "DINNER" ? "DINNER" : "LUNCH";
  const date = dateParam ? new Date(dateParam) : new Date();
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const sessions = await prisma.mealSession.findMany({
    where: {
      date: { gte: dayStart, lt: dayEnd },
      mealType,
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    select: {
      id: true,
      note: true,
      price: true,
      pickedUp: true,
      student: { select: { name: true, phone: true, orderCode: true } },
    },
  });

  const rows = sessions
    .map((s) => ({
      id: s.id,
      note: s.note,
      price: s.price,
      pickedUp: s.pickedUp,
      name: s.student.name,
      phone: s.student.phone,
      orderCode: s.student.orderCode,
    }))
    .sort(sortByOrderCode);

  const totalAmount = rows.reduce((sum, r) => sum + r.price, 0);
  const premiumPrices = Array.from(new Set(rows.filter((r) => isPremiumPrice(r.price)).map((r) => r.price))).sort(
    (a, b) => a - b,
  );
  const now = new Date();

  return (
    <>
      {/* Thermal receipt roll: fixed 80mm width, height grows with content
          (no fixed page height / no page breaks) — matches iPOS-style printers. */}
      <style>{`
        @page {
          size: 80mm auto;
          margin: 3mm;
        }
        @media print {
          html, body { width: 80mm; }
        }
      `}</style>

      <div className="mx-auto flex justify-between items-center gap-2 p-2 print:hidden">
        <p className="text-xs text-slate-500">Xem trước khổ 80mm (máy in nhiệt / iPOS). Ctrl/Cmd+P để in.</p>
        <PrintButton />
      </div>

      <div className="mx-auto bg-white text-black" style={{ width: "80mm", fontFamily: "Arial, sans-serif" }}>
        <div className="px-2 pb-1">
          <p className="text-[13px] font-bold text-center leading-tight">CĂNG TIN ĐHYHN THANH HÓA</p>
          <p className="text-[11px] text-center leading-tight">
            Danh sách suất ăn Bữa {MEAL_LABEL[mealType]} &middot; {dateFmt.format(dayStart)}
          </p>
          <p className="text-[10px] leading-tight mt-1">
            {timeFmt.format(now)} {dateFmt.format(now)}
          </p>
        </div>

        <div className="border-t border-black" />

        {rows.length === 0 && <p className="text-[11px] text-center py-4">Không có sinh viên nào đăng ký bữa này.</p>}

        {rows.map((r, i) => (
          <div key={r.id} className="flex gap-1.5 px-2 py-1.5 border-b border-dashed border-slate-400">
            <div className="w-9 flex-shrink-0 flex text-[12px] font-bold pt-0.5">
              <span className="w-3 flex-shrink-0 text-center">{isPremiumPrice(r.price) ? "★" : ""}</span>
              <span>{r.orderCode != null ? r.orderCode : i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold leading-tight">{r.name}</p>
              <p className="text-[10px] leading-tight">
                {r.phone} &middot; {currency.format(r.price)}
              </p>
              {r.note && <p className="text-[10px] italic leading-tight">{r.note}</p>}
            </div>
            <div className="w-4 h-4 border border-black flex-shrink-0 mt-0.5">
              {r.pickedUp && <div className="w-full h-full bg-black" />}
            </div>
          </div>
        ))}

        {rows.length > 0 && (
          <>
            <div className="border-t border-black" />
            {premiumPrices.length > 0 && (
              <p className="px-2 pt-1 text-[10px] leading-tight">
                ★ = suất {premiumPrices.map((p) => currency.format(p)).join(", ")}
              </p>
            )}
            <div className="px-2 py-1.5 text-[11px] font-semibold">
              Tổng: {rows.length} suất &middot; {currency.format(totalAmount)}
            </div>
          </>
        )}
      </div>
    </>
  );
}
