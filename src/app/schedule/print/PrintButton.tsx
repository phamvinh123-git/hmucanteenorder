"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="text-sm px-4 py-2 rounded-lg bg-red-600 text-white font-medium shadow-sm hover:bg-red-700 hover:shadow-md hover:-translate-y-0.5"
    >
      In danh sách
    </button>
  );
}
