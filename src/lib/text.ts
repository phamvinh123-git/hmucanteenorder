/** Lower-case and strip Vietnamese diacritics so "nguyen" also matches "Nguyễn". */
export function foldText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

/**
 * Compare two Vietnamese full names the way name lists are normally ordered: alphabetically by the
 * given name ("tên", the last word), then by the rest ("họ đệm"). e.g. "Trần Văn An" comes before "Lê Bình".
 */
export function compareVietnameseNames(a: string, b: string) {
  const split = (full: string) => {
    const parts = full.trim().split(/\s+/);
    const given = parts.pop() ?? "";
    return { given, rest: parts.join(" ") };
  };
  const x = split(a);
  const y = split(b);
  return x.given.localeCompare(y.given, "vi") || x.rest.localeCompare(y.rest, "vi");
}
