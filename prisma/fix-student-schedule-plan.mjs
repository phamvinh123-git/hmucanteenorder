// Pure planning logic for the one-off schedule correction of student 0914865263 (STT 110, Hoàng Đại Lộc).
//
// The original Excel was filled in wrong: the student cancelled Saturday and Sunday, but the sheet
// left Friday and Saturday blank and kept Sunday. Fix: every wrongly-kept Sunday meal is removed and
// the Friday meal two days earlier is added in its place, so the total number of meals is unchanged.
//   - Fridays before 3/10 are meals already eaten  -> recorded as eaten ("Đã lấy").
//   - Fridays from 3/10 on are regular upcoming meals.

export const PHONE = "0914865263";

/** [Sunday that was wrongly kept, Friday that was wrongly left blank] */
export const SWAPS = [
  ["2026-09-27", "2026-09-25"],
  ["2026-10-04", "2026-10-02"],
  ["2026-10-11", "2026-10-09"],
  ["2026-10-18", "2026-10-16"],
];

const MEALS = ["LUNCH", "DINNER"];
export const EATEN_BEFORE = "2026-10-03";
// Same clock rule as syncCompletedSessions: lunch is finished after 14:00, dinner after 20:00.
const FINISHED_HOUR = { LUNCH: 14, DINNER: 20 };
const VN_OFFSET_MS = 7 * 3600 * 1000;

/** "YYYY-MM-DD" of a stored date in Vietnam time, whatever the server timezone is. */
export const vnKey = (d) => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
const vnDayStart = (ymd) => new Date(`${ymd}T00:00:00+07:00`);

/**
 * @param sessions the student's sessions: { id, registrationId, studentId, date, mealType, status, price }
 * @returns ids of sessions to delete, session rows to create, and human-readable notes
 */
export function planFix(sessions, now = new Date()) {
  const nowVn = new Date(now.getTime() + VN_OFFSET_MS);
  const todayKey = nowVn.toISOString().slice(0, 10);
  const hour = nowVn.getUTCHours();

  const live = new Map();
  for (const s of sessions) {
    if (s.status !== "CANCELLED") live.set(`${vnKey(s.date)}|${s.mealType}`, s);
  }

  const remove = [];
  const create = [];
  const notes = [];

  for (const [sunday, friday] of SWAPS) {
    for (const meal of MEALS) {
      const sundaySession = live.get(`${sunday}|${meal}`);
      if (!sundaySession) {
        notes.push(`${sunday} ${meal}: không có buổi chủ nhật, bỏ qua`);
        continue;
      }
      remove.push(sundaySession.id);

      if (live.has(`${friday}|${meal}`)) {
        notes.push(`${friday} ${meal}: đã có sẵn buổi thứ 6, chỉ xóa buổi chủ nhật`);
        continue;
      }
      const eaten = friday < EATEN_BEFORE;
      const finished = friday < todayKey || (friday === todayKey && hour >= FINISHED_HOUR[meal]);
      create.push({
        registrationId: sundaySession.registrationId,
        studentId: sundaySession.studentId,
        date: vnDayStart(friday),
        mealType: meal,
        price: sundaySession.price,
        status: finished ? "COMPLETED" : "SCHEDULED",
        pickedUp: eaten,
        pickedUpAt: eaten ? now : null,
      });
    }
  }

  return { remove, create, notes };
}
