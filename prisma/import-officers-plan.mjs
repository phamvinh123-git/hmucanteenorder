// Pure planning logic for the officer ("cán bộ") account import.
//
// Input: the staff list [{ code, name, phone }] and the users that already exist [{ phone, staffCode, role }].
// An officer can log in with their staff code or their phone number. The `phone` column is the unique
// login, so an officer with no phone number of their own gets the staff code there as a placeholder
// (the officer replaces it with a real number in their profile).

export function planOfficers(officers, existingUsers) {
  // Every login name already in use, by either column.
  const taken = new Map();
  for (const u of existingUsers) {
    taken.set(u.phone, u);
    if (u.staffCode) taken.set(u.staffCode, u);
  }

  const create = [];
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

    // Imported on an earlier run (same staff code, or same phone for staff without a code).
    const same = (code && taken.get(code)) || taken.get(login);
    if (same && same.role === "OFFICER" && (code ? same.staffCode === code : true)) {
      alreadyThere.push(name);
      continue;
    }

    const clash = [login, code].filter(Boolean).find((id) => taken.has(id));
    if (clash) {
      skipped.push({ name, reason: `mã hoặc số điện thoại "${clash}" đã thuộc một tài khoản khác` });
      continue;
    }

    const row = { name, phone: login, staffCode: code };
    create.push(row);
    taken.set(login, { ...row, role: "OFFICER" });
    if (code) taken.set(code, { ...row, role: "OFFICER" });
  }

  return { create, alreadyThere, skipped };
}
