// Pure planning logic for the officer ("cán bộ") account import.
//
// Input: the staff list [{ code, name, phone }] and the users that already exist
// [{ id, name, phone, staffCode, role, isOfficer }].
//
// An officer can log in with their staff code or their phone number. The `phone` column is the unique
// login, so an officer with no phone number of their own gets the staff code there as a placeholder
// (the officer replaces it with a real number in their profile).
//
// Someone who already has a manager / sales / admin account under the same phone number is the same person
// wearing two hats: that account is merged (flagged as an officer, given the staff code) instead of getting
// a second login. The names must match, so two different people sharing one phone are never merged.

const fold = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function planOfficers(officers, existingUsers) {
  // Every login name already in use, by either column.
  const taken = new Map();
  for (const u of existingUsers) {
    taken.set(u.phone, u);
    if (u.staffCode) taken.set(u.staffCode, u);
  }

  const create = [];
  const merge = [];
  const alreadyThere = [];
  const skipped = [];

  for (const o of officers) {
    const name = String(o.name ?? "").trim();
    const code = o.code ? String(o.code).trim().toUpperCase() : null;
    const phone = o.phone ? String(o.phone).trim() : null;
    const login = phone ?? code;

    if (!name || !login) {
      skipped.push({ name: name || "(không tên)", reason: "thiếu tên, hoặc thiếu cả mã cán bộ lẫn số điện thoại" });
      continue;
    }

    const byCode = code ? taken.get(code) : undefined;
    const byLogin = taken.get(login);

    // Already done on an earlier run: the same staff code is on an officer account.
    if (byCode && byCode.isOfficer && byCode.staffCode === code) {
      alreadyThere.push(name);
      continue;
    }
    // Staff without a code that were imported before (matched by phone, already an officer).
    if (!code && byLogin && byLogin.isOfficer && fold(byLogin.name) === fold(name)) {
      alreadyThere.push(name);
      continue;
    }

    // The same person already has a staff account (manager, sales, admin) under this phone number: merge.
    const person = byLogin && !byLogin.isOfficer && !["STUDENT", "OFFICER"].includes(byLogin.role) ? byLogin : undefined;
    if (person && fold(person.name) === fold(name) && (!code || !byCode || byCode === person)) {
      merge.push({ id: person.id, name, staffCode: person.staffCode ?? code, role: person.role });
      person.isOfficer = true;
      if (!person.staffCode && code) {
        person.staffCode = code;
        taken.set(code, person);
      }
      continue;
    }

    const clash = [login, code].filter(Boolean).find((id) => taken.has(id));
    if (clash) {
      const owner = taken.get(clash);
      const why =
        owner && ["ADMIN", "MANAGER", "SALES"].includes(owner.role) && fold(owner.name) !== fold(name)
          ? `trùng với tài khoản của "${owner.name}" nhưng khác tên, cần kiểm tra thủ công`
          : `mã hoặc số điện thoại "${clash}" đã thuộc một tài khoản khác`;
      skipped.push({ name, reason: why });
      continue;
    }

    const row = { name, phone: login, staffCode: code };
    create.push(row);
    const entry = { ...row, role: "OFFICER", isOfficer: true };
    taken.set(login, entry);
    if (code) taken.set(code, entry);
  }

  return { create, merge, alreadyThere, skipped };
}
