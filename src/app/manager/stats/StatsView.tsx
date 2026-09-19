"use client";

import { useEffect, useState } from "react";
import { localDateKey } from "@/lib/client-session-rules";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Shared across all three chart modes and the summary cards above them, so
// Trưa/Tối always mean the same color no matter which range is selected.
const LUNCH_COLOR = "#f59e0b";
const DINNER_COLOR = "#6366f1";

type Range = "day" | "week" | "month" | "custom";

type StatsResponse = {
  range: Range;
  start: string;
  end: string;
  series: { date: string; lunch: number; dinner: number; revenue: number }[];
  summary: { totalMeals: number; lunchMeals: number; dinnerMeals: number; totalRevenue: number };
};

const currency = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const RANGE_LABEL: Record<Range, string> = {
  day: "Theo ngày",
  week: "Theo tuần",
  month: "Theo tháng",
  custom: "Tùy chọn khoảng ngày",
};

function fmtShort(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function addDaysLocal(key: string, n: number) {
  const d = new Date(key);
  d.setDate(d.getDate() + n);
  return localDateKey(d);
}

export default function StatsView() {
  const [range, setRange] = useState<Range>("week");
  const [customStart, setCustomStart] = useState(() => addDaysLocal(localDateKey(new Date()), -6));
  const [customEnd, setCustomEnd] = useState(() => localDateKey(new Date()));
  const [customError, setCustomError] = useState<string | null>(null);
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
        ? `/api/stats?range=custom&start=${customStart}&end=${customEnd}`
        : `/api/stats?range=${range}`;
    fetch(url)
      .then((res) => res.json())
      .then((d) => (d.error ? setCustomError(d.error) : setData(d)))
      .finally(() => setLoading(false));
  }, [range, customStart, customEnd]);

  const isSingleDay = range === "day" || (range === "custom" && (data?.series.length ?? 0) <= 1);
  const chartTitle =
    range === "day"
      ? "Số suất ăn theo buổi trong ngày"
      : range === "week"
        ? "Số suất ăn & doanh thu theo ngày trong tuần"
        : range === "month"
          ? "Số suất ăn & doanh thu theo ngày trong tháng"
          : isSingleDay
            ? "Số suất ăn theo buổi trong ngày"
            : "Số suất ăn & doanh thu theo ngày đã chọn";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Thống kê</h1>
        <p className="text-sm text-slate-500">Số suất ăn và doanh thu theo thời gian.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 animate-rise-in">
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
      </div>

      {customError && <p className="text-sm text-red-600 animate-pop-in">{customError}</p>}
      {loading && <p className="text-sm text-slate-400">Đang tải dữ liệu...</p>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-xl p-4 animate-rise-in hover:shadow-md transition-shadow"
              style={{ animationDelay: "0ms" }}
            >
              <p className="text-xs text-slate-500">Tổng suất ăn</p>
              <p className="text-xl font-bold text-slate-800">{data.summary.totalMeals}</p>
            </div>
            <div
              className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-xl p-4 animate-rise-in hover:shadow-md transition-shadow"
              style={{ animationDelay: "40ms" }}
            >
              <p className="text-xs text-slate-500">Bữa trưa</p>
              <p className="text-xl font-bold text-amber-600">{data.summary.lunchMeals}</p>
            </div>
            <div
              className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-xl p-4 animate-rise-in hover:shadow-md transition-shadow"
              style={{ animationDelay: "80ms" }}
            >
              <p className="text-xs text-slate-500">Bữa tối</p>
              <p className="text-xl font-bold text-indigo-600">{data.summary.dinnerMeals}</p>
            </div>
            <div
              className="bg-white border border-slate-200 border-l-4 border-l-red-500 rounded-xl p-4 animate-rise-in hover:shadow-md transition-shadow"
              style={{ animationDelay: "120ms" }}
            >
              <p className="text-xs text-slate-500">Doanh thu</p>
              <p className="text-xl font-bold text-green-600">{currency.format(data.summary.totalRevenue)}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 animate-rise-in" style={{ animationDelay: "160ms" }}>
            <p className="text-sm font-semibold text-slate-700 mb-3">{chartTitle}</p>
            {isSingleDay ? (
              // A single day has exactly one data point, so a day-over-day
              // trend line/bar doesn't apply — break it down by meal instead.
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={[
                    { meal: "Trưa", count: data.summary.lunchMeals },
                    { meal: "Tối", count: data.summary.dinnerMeals },
                  ]}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="meal" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip formatter={(value) => [value, "Số suất"]} />
                  <Bar dataKey="count" name="Số suất" radius={[4, 4, 0, 0]}>
                    <Cell fill={LUNCH_COLOR} />
                    <Cell fill={DINNER_COLOR} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={data.series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tickFormatter={fmtShort} tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip
                    labelFormatter={(l: React.ReactNode) => new Date(String(l)).toLocaleDateString("vi-VN")}
                    formatter={(value, name) =>
                      name === "Doanh thu" ? [currency.format(Number(value)), name] : [value, name]
                    }
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="lunch" name="Trưa" stackId="meals" fill={LUNCH_COLOR} radius={[0, 0, 0, 0]} />
                  <Bar yAxisId="left" dataKey="dinner" name="Tối" stackId="meals" fill={DINNER_COLOR} radius={[4, 4, 0, 0]} />
                  {/* linear, not monotone: monotone smoothing overshoots between sparse points
                      and draws a misleading peak that doesn't correspond to any real value. */}
                  <Line yAxisId="right" type="linear" dataKey="revenue" name="Doanh thu" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 animate-rise-in" style={{ animationDelay: "200ms" }}>
            <p className="text-sm font-semibold text-slate-700 mb-3">Chi tiết theo ngày</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-100">
                    <th className="py-2 pr-4">Ngày</th>
                    <th className="py-2 pr-4">Trưa</th>
                    <th className="py-2 pr-4">Tối</th>
                    <th className="py-2 pr-4">Tổng</th>
                    <th className="py-2 pr-4">Doanh thu</th>
                  </tr>
                </thead>
                <tbody>
                  {data.series.map((row) => (
                    <tr key={row.date} className="border-b border-slate-50 hover:bg-red-50/40 transition-colors">
                      <td className="py-1.5 pr-4">{new Date(row.date).toLocaleDateString("vi-VN")}</td>
                      <td className="py-1.5 pr-4">{row.lunch}</td>
                      <td className="py-1.5 pr-4">{row.dinner}</td>
                      <td className="py-1.5 pr-4 font-medium">{row.lunch + row.dinner}</td>
                      <td className="py-1.5 pr-4">{currency.format(row.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
