import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canAccessAdmin, DEFAULT_STUDENT_PASSWORD, getSession, hashPassword } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import { ROLE_LABEL, ROLE_PRIORITY } from "@/lib/roles";
import { registerOfficerLunchesFor } from "@/lib/meal-logic";
import { addDaysLocal, openWeekMondays } from "@/lib/officer-rules";

const schema = z.object({
  active: z.boolean().optional(),
  // Every role the account should hold (it can hold several). A student account stays a student.
  roles: z.array(z.enum(["ADMIN", "MANAGER", "SALES", "STUDENT", "OFFICER", "CANTEEN_SUPPORT", "UNION", "SERVICE_HEAD", "COURT_MANAGER", "CLUB_CAPTAIN"])).min(1, "Chọn ít nhất một vai trò.").optional(),
  // The clubs (sports) a club captain leads; sent together with the roles.
  captainSports: z.array(z.enum(["BADMINTON", "TABLE_TENNIS", "BASKETBALL"])).optional(),
  // Marks a manager/sales/admin as also being an officer (cán bộ), with the same login.
  isOfficer: z.boolean().optional(),
  resetPassword: z.boolean().optional(),
  // Correcting a wrong phone number or staff code (an empty phone gives an officer back the placeholder).
  phone: z.string().trim().max(20).optional(),
  staffCode: z.string().trim().max(40).optional(),
  // Department of an officer (empty clears it) and whether their lunches are registered automatically each week.
  department: z.string().trim().max(100).optional(),
  autoRegister: z.boolean().optional(),
});

const PHONE_RE = /^[0-9]{9,15}$/;
const CODE_RE = /^[A-Za-z0-9._-]{3,30}$/;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canAccessAdmin(session.roles)) {
    return NextResponse.json({ error: "Không có quyền truy cập." }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }
  const data = parsed.data;

  if (id === session.userId && (data.active === false || (data.roles && !data.roles.includes("ADMIN")))) {
    return NextResponse.json({ error: "Không thể tự khóa hoặc hạ quyền tài khoản của chính mình." }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (data.phone !== undefined || data.staffCode !== undefined) {
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });

    let becomesOfficer = false;
    let nextCode = target.staffCode;
    let nextPhone = target.phone;
    // An officer with no phone of their own has the staff code in the phone column as a placeholder.
    const hadPlaceholder = !!target.staffCode && target.phone === target.staffCode;

    // An empty code means "leave the code alone". Giving a code to a manager / sales / admin account
    // also makes them an officer (one login, both roles), so no separate toggle is needed first.
    if (data.staffCode !== undefined && data.staffCode !== "") {
      if (!CODE_RE.test(data.staffCode)) {
        return NextResponse.json({ error: "Mã gồm 3–30 ký tự chữ, số, dấu chấm, gạch ngang hoặc gạch dưới." }, { status: 400 });
      }
      nextCode = data.staffCode.toUpperCase();
      // (A student's code is the student code, which does not make the student an officer.)
      becomesOfficer = !target.isOfficer && target.role !== "OFFICER" && target.role !== "STUDENT";
      if (hadPlaceholder && data.phone === undefined) nextPhone = nextCode;
    }

    if (data.phone !== undefined) {
      if (data.phone === "") {
        if (!nextCode) return NextResponse.json({ error: "Tài khoản này cần có số điện thoại." }, { status: 400 });
        nextPhone = nextCode;
      } else if (!PHONE_RE.test(data.phone)) {
        return NextResponse.json({ error: "Số điện thoại gồm 9–15 chữ số." }, { status: 400 });
      } else {
        nextPhone = data.phone;
      }
    }

    // Both columns are logins, so neither value may match anyone else's phone or staff code.
    const ids = Array.from(new Set([nextPhone, nextCode].filter((v): v is string => !!v)));
    const clash = await prisma.user.findFirst({
      where: { id: { not: id }, OR: [{ phone: { in: ids } }, { staffCode: { in: ids } }] },
    });
    if (clash) {
      return NextResponse.json({ error: `Số điện thoại hoặc mã này đã thuộc về "${clash.name}".` }, { status: 409 });
    }

    if (nextPhone !== target.phone) updateData.phone = nextPhone;
    if (nextCode !== target.staffCode) updateData.staffCode = nextCode;
    if (becomesOfficer) updateData.isOfficer = true;
    if (Object.keys(updateData).length > 0) {
      await logActivity(
        session.userId,
        "UPDATE_USER",
        `Sửa thông tin đăng nhập của ${target.name}: SĐT ${target.phone} → ${nextPhone}, mã cán bộ ${target.staffCode ?? "(không)"} → ${nextCode ?? "(không)"}`,
      );
    }
  }

  if (data.department !== undefined || data.autoRegister !== undefined) {
    const target = await prisma.user.findUnique({ where: { id }, select: { name: true, isOfficer: true, role: true, department: true } });
    if (!target) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });
    if (!(target.isOfficer || target.role === "OFFICER" || data.isOfficer || data.roles?.includes("OFFICER"))) {
      return NextResponse.json({ error: "Chỉ tài khoản cán bộ mới có phòng ban và tự động đăng ký." }, { status: 400 });
    }
    if (data.department !== undefined) {
      updateData.department = data.department === "" ? null : data.department;
      await logActivity(session.userId, "UPDATE_USER", `Đặt phòng ban của ${target.name}: ${target.department ?? "(trống)"} → ${data.department || "(trống)"}`);
    }
    if (data.autoRegister !== undefined) {
      updateData.autoRegister = data.autoRegister;
      // Switching it on starts from scratch: the weeks open now are filled in the next time anyone loads a list.
      if (data.autoRegister) updateData.autoRegisteredWeek = null;
      await logActivity(session.userId, "UPDATE_USER", `${data.autoRegister ? "Bật" : "Tắt"} tự động đăng ký cơm trưa cho ${target.name}`);
    }
  }

  if (typeof data.active === "boolean") updateData.active = data.active;
  if (data.roles) {
    const target = await prisma.user.findUnique({ where: { id }, select: { name: true, role: true, captainSports: true } });
    if (!target) return NextResponse.json({ error: "Không tìm thấy tài khoản." }, { status: 404 });
    const wanted = Array.from(new Set(data.roles));
    const student = target.role === "STUDENT";
    if (wanted.includes("STUDENT") !== student) {
      return NextResponse.json({ error: "Không đổi được giữa tài khoản sinh viên và tài khoản nhân viên." }, { status: 400 });
    }
    if (student && wanted.includes("OFFICER")) {
      return NextResponse.json({ error: "Sinh viên không thể đồng thời là cán bộ." }, { status: 400 });
    }
    // The main role stays when it is still ticked; otherwise the highest ticked one takes over. "Cán bộ" on a
    // non-officer main role is the officer flag, so it is not kept in the list of extra roles.
    const main = wanted.includes(target.role) ? target.role : ROLE_PRIORITY.find((r) => wanted.includes(r))!;
    updateData.role = main;
    updateData.extraRoles = wanted.filter((r) => r !== main && r !== "OFFICER");
    updateData.isOfficer = wanted.includes("OFFICER");
    const sports = wanted.includes("CLUB_CAPTAIN") ? (data.captainSports ?? target.captainSports) : [];
    if (wanted.includes("CLUB_CAPTAIN") && sports.length === 0) {
      return NextResponse.json({ error: "Chọn CLB (môn) mà đội trưởng phụ trách." }, { status: 400 });
    }
    updateData.captainSports = sports;
    await logActivity(session.userId, "UPDATE_USER", `Đặt vai trò của ${target.name}: ${wanted.map((r) => ROLE_LABEL[r]).join(", ")}`);
  }
  if (typeof data.isOfficer === "boolean" && !data.roles) {
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (target && target.role !== "OFFICER" && target.role !== "STUDENT") updateData.isOfficer = data.isOfficer;
  }
  if (data.resetPassword) {
    updateData.passwordHash = await hashPassword(DEFAULT_STUDENT_PASSWORD);
    updateData.mustChangePassword = true;
  }

  const user = await prisma.user.update({ where: { id }, data: updateData });
  if (data.phone === undefined && data.staffCode === undefined) {
    await logActivity(session.userId, "UPDATE_USER", `Cập nhật tài khoản ${user.name} (${user.phone}): ${JSON.stringify(data)}`);
  }

  // Switching automatic registration on starts it at once: lunches from today to the end of the last week that is
  // open for ordering are registered now (the weekly deadline does not apply), instead of waiting for the next week to
  // open. Days already registered or cancelled by the officer are left alone, past days are skipped.
  if (data.autoRegister === true && user.active) {
    try {
      const open = openWeekMondays(new Date());
      const last = open[open.length - 1];
      const r = await registerOfficerLunchesFor({
        officerId: id,
        from: new Date(),
        to: addDaysLocal(last, 4),
        actorId: session.userId,
      });
      await logActivity(session.userId, "OFFICER_REGISTER_FOR", `Bật tự động ĐK cho ${r.name}: đăng ký ngay ${r.added} ngày cơm trưa (bật lại ${r.revived})`);
    } catch (err) {
      console.error("Immediate auto-registration failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
