// Why can a student not restore a meal? Read-only: it changes nothing.
//
//   node prisma/check-restore.mjs 0912345678              today's meals of the student with that phone
//   node prisma/check-restore.mjs "Nguyễn Văn A"          by (part of the) name or student code
//   node prisma/check-restore.mjs 0912345678 2026-11-25   another day
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [who, dayArg] = process.argv.slice(2);

const pad = (n) => String(n).padStart(2, "0");
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const meal = (m) => (m === "LUNCH" ? "trưa" : "tối");
const show = (s) =>
  `${day(s.date)} ${meal(s.mealType)} | ${s.status}${s.pickedUp ? " | đã lấy cơm" : ""}${s.note ? ` | ghi chú: ${s.note}` : ""}`;
const isRemoval = (note) => !!note && /^(Xóa thủ công|Giảm gói|Tự động bớt)/.test(note);

async function main() {
  if (!who) {
    console.log('Cách dùng: node prisma/check-restore.mjs <số điện thoại | tên | mã SV> [YYYY-MM-DD]');
    return;
  }
  const users = await prisma.user.findMany({
    where: { OR: [{ phone: who }, { staffCode: who.toUpperCase() }, { name: { contains: who, mode: "insensitive" } }] },
    select: { id: true, name: true, phone: true, role: true, isOfficer: true, active: true },
  });
  if (users.length !== 1) {
    console.log(users.length === 0 ? "Không tìm thấy người này." : "Có nhiều người trùng, chạy lại với số điện thoại:");
    for (const u of users) console.log(`  ${u.name} - ${u.phone}`);
    return;
  }
  const u = users[0];
  const now = new Date();
  const dayKey = dayArg ?? key(now);
  console.log(`Giờ máy chủ: ${now.toString()}`);
  console.log(`Người dùng: ${u.name} - ${u.phone} | vai trò ${u.role}${u.isOfficer ? " | cán bộ" : ""}${u.active ? "" : " | TÀI KHOẢN ĐANG KHÓA"}`);

  const all = await prisma.mealSession.findMany({
    where: { studentId: u.id },
    orderBy: [{ date: "asc" }, { mealType: "desc" }],
    include: { compensatedBy: true, registration: { select: { mealPattern: true, totalSessions: true } } },
  });
  const byId = new Map(all.map((s) => [s.id, s]));
  const onDay = all.filter((s) => key(s.date) === dayKey);
  console.log(`\n== Suất ăn ngày ${dayKey}: ${onDay.length}`);

  for (const s of onDay) {
    console.log(`\n* ${show(s)}`);
    console.log(`  ngày lưu: ${s.date.toString()} | gói ${s.registration.mealPattern} ${s.registration.totalSessions} buổi`);
    if (s.cancelledAt) console.log(`  hủy lúc: ${s.cancelledAt.toString()}`);
    if (s.status !== "CANCELLED") {
      console.log("  => Buổi này không ở trạng thái đã hủy, không có gì để khôi phục.");
      continue;
    }
    const reasons = [];
    const cutoff = new Date(s.date);
    cutoff.setHours(s.mealType === "LUNCH" ? 9 : 15, 0, 0, 0);
    if (dayKey < key(now)) reasons.push("Ngày ăn đã qua.");
    else if (dayKey === key(now) && now >= cutoff) reasons.push(`Đã quá ${cutoff.getHours()}h00.`);

    let c = s.compensatedBy ? byId.get(s.compensatedBy.id) : undefined;
    if (!s.compensatedBy) {
      reasons.push("Không có suất bù nào gắn với lần hủy này (web không hiện nút Khôi phục).");
    }
    for (let hops = 0; c && hops < 50; hops++) {
      console.log(`  suất bù ${hops + 1}: ${show(c)}`);
      if (c.status === "SCHEDULED" && !c.pickedUp) break;
      if (c.status !== "CANCELLED") {
        reasons.push("Suất bù đã được ăn.");
        break;
      }
      if (isRemoval(c.note)) {
        reasons.push("Suất bù đã bị nhân viên xóa hoặc giảm.");
        break;
      }
      if (!c.compensatedBy) {
        reasons.push("Suất bù đã bị hủy và không còn suất bù tiếp theo.");
        break;
      }
      c = byId.get(c.compensatedBy.id);
    }
    const clash = all.filter((x) => x.id !== s.id && x.status !== "CANCELLED" && key(x.date) === dayKey && x.mealType === s.mealType);
    if (clash.length > 0) reasons.push(`Đã có ${clash.length} suất khác đúng ngày và bữa này.`);

    console.log(reasons.length ? `  => BỊ CHẶN: ${reasons.join(" ")}` : "  => Theo dữ liệu thì ĐƯỢC khôi phục.");
  }

  console.log("\n== Các suất quanh ngày này (đã hủy và sắp tới)");
  for (const s of all.filter((x) => key(x.date) >= dayKey).slice(0, 40)) console.log(`  ${show(s)}`);

  const logs = await prisma.activityLog.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: 8 });
  console.log("\n== Thao tác gần đây của tài khoản");
  for (const l of logs) console.log(`  ${l.createdAt.toString().slice(0, 24)} | ${l.action} | ${l.detail ?? ""}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
