// Kinds of court and weekday helpers in plain data, safe to import from client components.

export type CourtKind = "BADMINTON" | "TABLE_TENNIS" | "FOOTBALL" | "BASKETBALL" | "PICKLEBALL" | "OTHER";

export const COURT_KINDS: { key: CourtKind; label: string; icon: string }[] = [
  { key: "BADMINTON", label: "Cầu lông", icon: "🏸" },
  { key: "TABLE_TENNIS", label: "Bóng bàn", icon: "🏓" },
  { key: "FOOTBALL", label: "Bóng đá", icon: "⚽" },
  { key: "BASKETBALL", label: "Bóng rổ", icon: "🏀" },
  { key: "PICKLEBALL", label: "Pickleball", icon: "🎾" },
  { key: "OTHER", label: "Sân khác", icon: "🏟️" },
];

export const COURT_KIND_KEYS = COURT_KINDS.map((k) => k.key) as [CourtKind, ...CourtKind[]];

/** Weekdays as the website names them (Monday first); the number is JavaScript's getDay(): Sunday 0 ... Saturday 6. */
export const WEEKDAYS: { day: number; short: string; label: string }[] = [
  { day: 1, short: "T2", label: "Thứ 2" },
  { day: 2, short: "T3", label: "Thứ 3" },
  { day: 3, short: "T4", label: "Thứ 4" },
  { day: 4, short: "T5", label: "Thứ 5" },
  { day: 5, short: "T6", label: "Thứ 6" },
  { day: 6, short: "T7", label: "Thứ 7" },
  { day: 0, short: "CN", label: "Chủ nhật" },
];

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** "Mọi ngày", or "Thứ 3, 5, 7" for the days a court is lent out. */
export function openDaysLabel(days: number[]) {
  if (days.length >= 7) return "Mọi ngày";
  const ordered = WEEKDAYS.filter((w) => days.includes(w.day));
  return "Thứ " + ordered.map((w) => (w.day === 0 ? "CN" : String(w.day + 1))).join(", ");
}
