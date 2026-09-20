// Fixed choices for a student's major ("Ngành") and year ("Lớp").
// Stored as plain text; validated against these lists in the API.
export const MAJORS = [
  "Cử nhân kĩ thuật hình ảnh y học",
  "Bác sĩ y khoa",
  "Cử nhân điều dưỡng",
  "Cử nhân xét nghiệm",
  "Cử nhân phục hồi chức năng",
] as const;

export type Major = (typeof MAJORS)[number];

const MEDICAL_DOCTOR: Major = "Bác sĩ y khoa";

/** Bác sĩ y khoa is a 6-year program (Y1–Y6); every other major has Y1–Y4. */
export function classLevelsFor(major: string | null | undefined): string[] {
  return major === MEDICAL_DOCTOR ? ["Y1", "Y2", "Y3", "Y4", "Y5", "Y6"] : ["Y1", "Y2", "Y3", "Y4"];
}

export function isMajor(value: string): value is Major {
  return (MAJORS as readonly string[]).includes(value);
}

export function isValidClassFor(major: string | null | undefined, className: string) {
  return classLevelsFor(major).includes(className);
}
