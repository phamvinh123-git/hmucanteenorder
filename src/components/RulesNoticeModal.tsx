"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const FLAG = "canteenRulesPending";

/** Meal-rules notice shown after each student login; the dashboard stays behind it until it is acknowledged. */
export default function RulesNoticeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the post-login flag on mount
      if (sessionStorage.getItem(FLAG)) setOpen(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function acknowledge() {
    try {
      sessionStorage.removeItem(FLAG);
    } catch {}
    setOpen(false);
  }

  if (!open) return null;

  // Portal to <body>: an ancestor with a CSS transform (the page entrance animation) would otherwise anchor `fixed` to itself.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Lưu ý khi đăng ký/hủy suất ăn"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-pop-in">
        <div className="bg-gradient-to-r from-red-600 to-red-500 px-5 py-4 text-white">
          <h2 className="text-lg font-bold leading-tight">📣 LƯU Ý KHI ĐĂNG KÝ/HỦY SUẤT ĂN</h2>
          <p className="mt-1 text-sm text-red-100">🔔 Quy định này áp dụng từ ngày 22/9/2026.</p>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-slate-700">
          <p>Các bạn vui lòng kiểm tra kỹ ngày và số suất ăn trước khi xác nhận đăng ký.</p>
          <p>
            🔹 Nếu không có nhu cầu sử dụng, vui lòng <b>HỦY BỮA</b> trên App trước thời gian chốt suất ăn:
          </p>
          <div className="space-y-2 rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700">
            <p>🍚 Hủy ăn trưa: trước 09h00</p>
            <p>🍚 Hủy ăn tối: trước 15h00</p>
          </div>
          <p>
            ⚠️ Sau thời gian trên, hệ thống chốt suất ăn để Nhà ăn chuẩn bị nguyên liệu nên{" "}
            <b>không thể hủy và không hoàn tiền</b>.
          </p>
          <p>
            👉 Mong các bạn thực hiện đúng thời gian để hạn chế suất ăn bị bỏ, đồng thời giúp Nhà ăn chuẩn bị đầy đủ
            và phục vụ tốt nhất.
          </p>
          <p>Xin cảm ơn các bạn! ❤️</p>
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <button
            onClick={acknowledge}
            autoFocus
            className="w-full rounded-xl bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
          >
            Tôi đã đọc và đồng ý
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
