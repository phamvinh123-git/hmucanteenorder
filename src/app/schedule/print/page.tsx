import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { Fragment } from "react";
import { compareVietnameseNames } from "@/lib/text";
import { dinerWhere, parseGroup } from "@/lib/groups";
import PrintButton from "./PrintButton";
import { isPremiumPrice } from "@/lib/pricing";

const MEAL_LABEL: Record<string, string> = { LUNCH: "Trưa", DINNER: "Tối" };
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });
const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" });

type SortRow = { orderCode: number | null; name: string; isOfficer: boolean };

// Officers (cán bộ) first, in alphabetical order of name; then students by their order number.
function sortByOrderCode(a: SortRow, b: SortRow) {
  if (a.isOfficer !== b.isOfficer) return a.isOfficer ? -1 : 1;
  if (a.isOfficer && b.isOfficer) return compareVietnameseNames(a.name, b.name);
  if (a.orderCode != null && b.orderCode != null) return a.orderCode - b.orderCode;
  if (a.orderCode != null) return -1;
  if (b.orderCode != null) return 1;
  return a.name.localeCompare(b.name, "vi");
}

export default async function SchedulePrintPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; mealType?: string; group?: string }>;
}) {
  await requireUser({ roles: ["SALES", "MANAGER", "ADMIN"] });

  const { date: dateParam, mealType: mealTypeParam, group: groupParam } = await searchParams;
  // group=OFFICER: staff only; group=ALL: students and staff together; otherwise students only.
  // Officers (cán bộ) sign on the printout instead of being ticked off as picked up.
  const group = parseGroup(groupParam, "STUDENT");
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
      student: dinerWhere(group),
    },
    select: {
      id: true,
      note: true,
      price: true,
      pickedUp: true,
      student: { select: { name: true, phone: true, staffCode: true, isOfficer: true, orderCode: true } },
    },
  });

  const rows = sessions
    .map((s) => ({
      id: s.id,
      note: s.note,
      price: s.price,
      pickedUp: s.pickedUp,
      name: s.student.name,
      // Officers are listed by staff code, students by phone number.
      phone: s.student.staffCode ?? s.student.phone,
      orderCode: s.student.orderCode,
      isOfficer: s.student.isOfficer,
    }))
    .sort(sortByOrderCode);

  // Officers' meal prices are never shown, so the money total only covers students.
  const officerCount = rows.filter((r) => r.isOfficer).length;
  const studentCount = rows.length - officerCount;
  const totalAmount = rows.filter((r) => !r.isOfficer).reduce((sum, r) => sum + r.price, 0);
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
            {group === "OFFICER" ? "Danh sách cán bộ" : "Danh sách suất ăn"} Bữa {MEAL_LABEL[mealType]} &middot; {dateFmt.format(dayStart)}
          </p>
          <p className="text-[10px] leading-tight mt-1">
            {timeFmt.format(now)} {dateFmt.format(now)}
          </p>
        </div>

        <div className="border-t border-black" />

        {rows.length === 0 && <p className="text-[11px] text-center py-4">Không có {group === "OFFICER" ? "cán bộ" : group === "ALL" ? "ai" : "sinh viên"} nào đăng ký bữa này.</p>}

        {rows.map((r, i) => (
          <Fragment key={r.id}>
          {group === "ALL" && (i === 0 || rows[i - 1].isOfficer !== r.isOfficer) && (
            // A light rule and a small caption mark where officers end and students begin.
            <div className={`px-2 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-wide ${i > 0 ? "border-t border-slate-400" : ""}`}>
              {r.isOfficer ? `Cán bộ (${officerCount})` : `Sinh viên (${studentCount})`}
            </div>
          )}
          <div className="flex gap-1.5 px-2 py-1.5 border-b border-dashed border-slate-400">
            <div className="w-9 flex-shrink-0 flex text-[12px] font-bold pt-0.5">
              <span className="w-3 flex-shrink-0 text-center">{isPremiumPrice(r.price) ? "★" : ""}</span>
              {/* The number is a student's order code. Officers are identified by their staff code under the
                  name instead, so they get no number here. */}
              <span>{r.isOfficer ? "" : r.orderCode != null ? r.orderCode : i + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold leading-tight">{r.name}</p>
              <p className="text-[10px] leading-tight">
                {r.phone}
                {!r.isOfficer && <> &middot; {currency.format(r.price)}</>}
              </p>
              {r.note && <p className="text-[10px] italic leading-tight">{r.note}</p>}
            </div>
            {r.isOfficer ? (
              // A blank box to sign in, instead of the pickup tick.
              <div className="w-20 h-9 border border-black flex-shrink-0" />
            ) : (
              <div className="w-4 h-4 border border-black flex-shrink-0 mt-0.5">
                {r.pickedUp && <div className="w-full h-full bg-black" />}
              </div>
            )}
          </div>
          </Fragment>
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
              Tổng: {rows.length} suất
              {group === "ALL" && (
                <>
                  {" "}
                  ({studentCount} sinh viên, {officerCount} cán bộ)
                </>
              )}
              {studentCount > 0 && (
                <>
                  {" "}
                  &middot; {group === "ALL" ? "Tiền sinh viên: " : ""}
                  {currency.format(totalAmount)}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
