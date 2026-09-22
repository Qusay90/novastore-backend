export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[Iİı]/g, "i")
    .toLocaleLowerCase("tr-TR")
    .trim();
}
