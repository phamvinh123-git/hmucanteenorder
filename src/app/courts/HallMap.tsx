"use client";

import { useRef, useState } from "react";
import type { CourtKind } from "@/lib/court-kinds";
import { CourtSurface } from "./Court3D";

// The indoor hall as one tilted 3D floor plan (CSS 3D transforms, no libraries), laid out like the real hall:
// the table tennis courts side by side along the back, then badminton court 2, then badminton court 1 in front.
// Tap a court on the plan to choose it; drag the plan (or use the buttons) to turn it.

export type HallCourt = {
  id: string;
  name: string;
  kind: CourtKind;
  /** Lent out on the day being looked at. */
  open: boolean;
  /** Free slots left that day. */
  free: number;
};

/** "Sân bóng bàn 1" as "Bóng bàn 1". */
const shortName = (name: string) => {
  const n = name.replace(/^Sân /, "");
  return n.charAt(0).toUpperCase() + n.slice(1);
};

const HOME = { yaw: 0, tilt: 40 };
const TOP = { yaw: 0, tilt: 0 };
/** A drag shorter than this (in pixels) is a tap on a court, not a turn. */
const DRAG_START = 7;
const clampTilt = (t: number) => Math.min(65, Math.max(0, t));
/** Shrinks the turned plan so its corners stay inside the box (the plan is 1 wide and 1/0.95 deep). */
const zoomFor = (yaw: number) => {
  const a = (yaw * Math.PI) / 180;
  return 1 / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)) / 0.95);
};

const byName = (a: HallCourt, b: HallCourt) => a.name.localeCompare(b.name, "vi", { numeric: true });

export default function HallMap({
  courts,
  selectedId,
  onPick,
}: {
  courts: HallCourt[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const tableTennis = courts.filter((c) => c.kind === "TABLE_TENNIS").sort(byName);
  // Badminton court 2 sits behind court 1 on the plan, so the highest number comes first (back to front).
  const badminton = courts.filter((c) => c.kind === "BADMINTON").sort(byName).reverse();
  const rows: HallCourt[][] = [...(tableTennis.length ? [tableTennis] : []), ...badminton.map((c) => [c])];
  const rowFr = rows.map((r) => (r.length > 1 ? "0.8fr" : "1fr")).join(" ");

  const [view, setView] = useState(HOME);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; yaw: number; tilt: number; moved: boolean } | null>(null);
  const turned = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    turned.current = false;
    drag.current = { x: e.clientX, y: e.clientY, yaw: view.yaw, tilt: view.tilt, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_START) return;
      d.moved = true;
      turned.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    // Sideways turns the plan; up and down tilts it (on a phone, up and down scrolls the page instead).
    setView({ yaw: d.yaw - dx * 0.45, tilt: e.pointerType === "mouse" ? clampTilt(d.tilt - dy * 0.3) : d.tilt });
  }
  function endDrag() {
    drag.current = null;
    setDragging(false);
  }
  const turn = (by: number) => setView((v) => ({ yaw: Math.round((v.yaw + by) / 45) * 45, tilt: v.tilt }));
  const isTop = view.tilt === 0;
  const tool = "rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:ring-red-300 active:scale-95";

  return (
    <div>
      <div
        className={`hall3d ${dragging ? "is-dragging" : ""}`}
        aria-label="Sơ đồ nhà thi đấu"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (!drag.current?.moved) drag.current = null;
        }}
        // The click that ends a drag must not choose a court.
        onClickCapture={(e) => {
          if (turned.current) {
            e.stopPropagation();
            turned.current = false;
          }
        }}
      >
      <div
        className="hall3d-stage"
        style={{ "--yaw": `${view.yaw}deg`, "--tilt": `${view.tilt}deg`, "--zoom": zoomFor(view.yaw) } as React.CSSProperties}
      >
        <div className="hall3d-floor" style={{ gridTemplateRows: rowFr }}>
          {rows.map((row, ri) => (
            <div key={ri} className="hall3d-row" style={{ gridTemplateColumns: `repeat(${row.length}, 1fr)` }}>
              {row.map((c) => {
                const on = selectedId === c.id;
                const state = !c.open ? "is-closed" : c.free === 0 ? "is-full" : "";
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={on}
                    aria-label={`${c.name}: ${!c.open ? "nghỉ hôm nay" : c.free > 0 ? `${c.free} ca trống` : "hết ca"}`}
                    onClick={() => onPick(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onPick(c.id);
                      }
                    }}
                    className={`hall3d-zone ${state} ${on ? "is-selected" : ""}`}
                  >
                    <CourtSurface kind={c.kind} landscape />
                    <div className="hall3d-net" aria-hidden />
                    <div className="hall3d-label">
                      <b>{shortName(c.name)}</b>
                      <span>{!c.open ? "Nghỉ hôm nay" : c.free > 0 ? `${c.free} ca trống` : "Hết ca"}</span>
                    </div>
                    {on && <div className="hall3d-tick" aria-hidden>✓</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-2">
        <button type="button" className={tool} onClick={() => turn(-45)} aria-label="Xoay sang trái">
          ↺ Xoay trái
        </button>
        <button type="button" className={tool} onClick={() => turn(45)} aria-label="Xoay sang phải">
          Xoay phải ↻
        </button>
        <button type="button" className={tool} onClick={() => setView((v) => ({ yaw: v.yaw, tilt: isTop ? HOME.tilt : TOP.tilt }))}>
          {isTop ? "Nhìn nghiêng 3D" : "Nhìn từ trên"}
        </button>
        <button type="button" className={tool} onClick={() => setView(HOME)}>
          Về mặc định
        </button>
      </div>
      <p className="mb-1 text-center text-[11px] text-slate-400">Kéo ngang trên sơ đồ để xoay</p>
    </div>
  );
}
