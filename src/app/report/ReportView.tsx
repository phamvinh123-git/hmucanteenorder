"use client";

import PageHeader from "@/components/PageHeader";
import { useEffect, useState } from "react";
import { localDateKey } from "@/lib/client-session-rules";

type Range = "day" | "week" | "month" | "custom";

type ReportRow = {
  studentId: string;
  name: string;
  orderCode: number | null;
  major: string | null;
  className: string | null;
  booked: number;
  eaten: number;
};

type RegistrationRow = {
  studentId: string;
  name: string;
  phone: string;
  orderCode: number | null;
  major: string | null;
  className: string | null;
  totalSessions: number;
  mealPattern: "LUNCH" | "DINNER" | "BOTH";
  pricePerMeal: number;
  startDate: string;
  createdAt: string;
};

type ReportResponse = {
  start: string;
  end: string;
  rows: ReportRow[];
  newRegistrations: RegistrationRow[];
  renewals: RegistrationRow[];
  summary: { totalStudents: number; totalBooked: number; totalEaten: number };
};

const PATTERN_LABEL: Record<RegistrationRow["mealPattern"], string> = {
  LUNCH: "Trưa",
  DINNER: "Tối",
  BOTH: "Trưa & Tối",
};

const RANGE_LABEL: Record<Range, string> = {
  day: "Theo ngày",
  week: "Theo tuần",
  month: "Theo tháng",
  custom: "Tùy chọn khoảng ngày",
};

function addDaysLocal(key: string, n: number) {
  const d = new Date(key);
  d.setDate(d.getDate() + n);
  return localDateKey(d);
}

const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

export default function ReportView() {
  const [range, setRange] = useState<Range>("week");
  const [customStart, setCustomStart] = useState(() => addDaysLocal(localDateKey(new Date()), -6));
  const [customEnd, setCustomEnd] = useState(() => localDateKey(new Date()));
  const [customError, setCustomError] = useState<string | null>(null);
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (range === "custom" && customStart > customEnd) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- validation feedback when filters change
      setCustomError("Ngày bắt đầu phải trước ngày kết thúc.");
      return;
    }
    setCustomError(null);
    setLoading(true);
    const url =
      range === "custom"
        ? `/api/reports?range=custom&start=${customStart}&end=${customEnd}`
        : `/api/reports?range=${range}`;
    fetch(url)
      .then((res) => res.json())
      .then((d) => (d.error ? setCustomError(d.error) : setData(d)))
      .finally(() => setLoading(false));
  }, [range, customStart, customEnd]);

  function matchesSearch(r: { name: string; major: string | null; className: string | null }) {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.major ?? "").toLowerCase().includes(q) ||
      (r.className ?? "").toLowerCase().includes(q)
    );
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const rows = data?.rows.filter(matchesSearch);
  const newRegistrations = data?.newRegistrations.filter(matchesSearch);
  const renewals = data?.renewals.filter(matchesSearch);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader title="Báo cáo" subtitle="Số suất đã đặt và đã ăn của từng sinh viên theo thời gian." />
      </div>
      <div className="hidden print:block text-center">
        <p className="text-sm">Đại học Y Hà Nội – Phân hiệu Thanh Hóa</p>
        <h1 className="text-xl font-bold uppercase">Báo cáo suất ăn căng tin</h1>
        {data && (
          <p className="text-sm">
            Từ {dateFmt.format(new Date(data.start))} đến {dateFmt.format(new Date(data.end))}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 animate-rise-in print:hidden">
        <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
          {(["day", "week", "month", "custom"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 ${
                range === r ? "bg-red-600 text-white" : "bg-white text-slate-600 hover:bg-red-50 hover:text-red-700"
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Từ</span>
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            <span className="text-slate-500">đến</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên, ngành hoặc lớp..."
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm w-full sm:w-56 outline-none transition-colors focus:border-red-500 focus:ring-2 focus:ring-red-100"
        />
        <button
          onClick={() => window.print()}
          disabled={!data || loading}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
        >
          In báo cáo
        </button>
      </div>

      {customError && <p className="text-sm text-red-600 animate-pop-in">{customError}</p>}
      {loading && <p className="text-sm text-slate-400">Đang tải dữ liệu...</p>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 print:gap-2">
            <div className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-2xl shadow-sm p-4 animate-rise-in">
              <p className="text-xs text-slate-500">Số sinh viên</p>
              <p className="text-xl font-bold text-slate-800">{data.summary.totalStudents}</p>
            </div>
            <div className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-2xl shadow-sm p-4 animate-rise-in" style={{ animationDelay: "40ms" }}>
              <p className="text-xs text-slate-500">Tổng suất đã đặt</p>
              <p className="text-xl font-bold text-red-600">{data.summary.totalBooked}</p>
            </div>
            <div className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-2xl shadow-sm p-4 animate-rise-in" style={{ animationDelay: "80ms" }}>
              <p className="text-xs text-slate-500">Tổng suất đã ăn</p>
              <p className="text-xl font-bold text-green-600">{data.summary.totalEaten}</p>
            </div>
            <button
              type="button"
              onClick={() => scrollToSection("report-new-registrations")}
              className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-2xl shadow-sm p-4 text-left animate-rise-in transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md print:hover:translate-y-0"
              style={{ animationDelay: "120ms" }}
              title="Xem danh sách sinh viên mới đăng ký"
            >
              <p className="text-xs text-slate-500">Đăng ký mới ↓</p>
              <p className="text-xl font-bold text-slate-800">{data.newRegistrations.length}</p>
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("report-renewals")}
              className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-2xl shadow-sm p-4 text-left animate-rise-in transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md print:hover:translate-y-0"
              style={{ animationDelay: "160ms" }}
              title="Xem danh sách sinh viên mới gia hạn"
            >
              <p className="text-xs text-slate-500">Gia hạn ↓</p>
              <p className="text-xl font-bold text-slate-800">{data.renewals.length}</p>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 animate-rise-in print:border-0 print:shadow-none print:p-0" style={{ animationDelay: "120ms" }}>
            <p className="text-sm text-slate-500 mb-3 print:hidden">
              {dateFmt.format(new Date(data.start))} – {dateFmt.format(new Date(data.end))}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm print:text-xs print:[&_td]:border print:[&_th]:border print:[&_td]:border-slate-400 print:[&_th]:border-slate-400 print:[&_td]:px-2 print:[&_th]:px-2">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100 print:text-black">
                    <th className="py-2 pr-4">STT</th>
                    <th className="py-2 pr-4">Họ và tên</th>
                    <th className="py-2 pr-4">Ngành</th>
                    <th className="py-2 pr-4">Lớp</th>
                    <th className="py-2 pr-4 text-right">Suất đã đặt</th>
                    <th className="py-2 pr-4 text-right">Suất đã ăn</th>
                  </tr>
                </thead>
                <tbody>
                  {rows && rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        Không có dữ liệu trong khoảng thời gian này.
                      </td>
                    </tr>
                  )}
                  {rows?.map((r) => (
                    <tr key={r.studentId} className="border-b border-slate-50 hover:bg-red-50/40 transition-colors">
                      <td className="py-1.5 pr-4 font-mono">{r.orderCode ?? "—"}</td>
                      <td className="py-1.5 pr-4">{r.name}</td>
                      <td className="py-1.5 pr-4 text-slate-500">{r.major || "—"}</td>
                      <td className="py-1.5 pr-4 text-slate-500">{r.className || "—"}</td>
                      <td className="py-1.5 pr-4 text-right">{r.booked}</td>
                      <td className="py-1.5 pr-4 text-right text-green-600 font-medium">{r.eaten}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div id="report-new-registrations" className="scroll-mt-4 animate-rise-in print:break-before-page" style={{ animationDelay: "160ms" }}>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Sinh viên mới đăng ký ({newRegistrations?.length ?? 0})
              <span className="ml-2 font-normal text-slate-400 print:hidden">Lần đầu đăng ký ăn trong khoảng thời gian này</span>
            </p>
            <RegistrationList rows={newRegistrations} emptyLabel="Không có sinh viên mới đăng ký trong khoảng thời gian này." />
          </div>

          <div id="report-renewals" className="scroll-mt-4 animate-rise-in print:break-before-page" style={{ animationDelay: "200ms" }}>
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Sinh viên mới gia hạn ({renewals?.length ?? 0})
              <span className="ml-2 font-normal text-slate-400 print:hidden">
                Đã đăng ký từ trước, mua thêm đợt mới trong khoảng thời gian này
              </span>
            </p>
            <RegistrationList rows={renewals} emptyLabel="Không có sinh viên nào gia hạn trong khoảng thời gian này." />
          </div>
        </>
      )}
    </div>
  );
}

function RegistrationList({ rows, emptyLabel }: { rows: RegistrationRow[] | undefined; emptyLabel: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-100 print:border-0 print:shadow-none print:divide-slate-200">
      {rows && rows.length === 0 && <p className="p-3 text-sm text-slate-400">{emptyLabel}</p>}
      {rows?.map((r) => (
        <div
          key={`${r.studentId}-${r.createdAt}`}
          className="p-3 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 hover:bg-red-50/40 transition-colors print:text-xs"
        >
          <span className="text-slate-400 sm:w-28 flex-shrink-0">{dateFmt.format(new Date(r.createdAt))}</span>
          <span className="font-medium text-slate-700 sm:w-52 flex-shrink-0">
            {r.orderCode != null && <span className="font-mono text-red-700">{r.orderCode} · </span>}
            {r.name}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 w-fit flex-shrink-0">
            {PATTERN_LABEL[r.mealPattern]}
          </span>
          <span className="text-slate-500">
            {r.totalSessions} buổi &middot; {currency.format(r.pricePerMeal)} &middot; từ {dateFmt.format(new Date(r.startDate))}
            &middot; {r.phone}
            {r.className || r.major ? ` · ${r.className || "—"}${r.major ? ` (${r.major})` : ""}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
