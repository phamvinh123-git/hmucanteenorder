import type { CourtKind } from "@/lib/court-kinds";
import { CourtSurface } from "./Court3D";

// The indoor hall as one tilted 3D floor plan (CSS 3D transforms, no libraries), laid out like the real hall:
// the table tennis courts side by side along the back, then badminton court 2, then badminton court 1 in front.
// Tap a court on the plan to choose it.

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

  return (
    <div className="hall3d" aria-label="Sơ đồ nhà thi đấu">
      <div className="hall3d-stage">
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
  );
}
