export function nextQuoteNumber(
  existing: Array<{ quoteNumber?: string | null }>,
  date = new Date(),
): string {
  const year = date.getFullYear();
  const prefix = `COT-${year}-`;
  let max = 0;
  for (const q of existing) {
    const n = q.quoteNumber ?? "";
    if (!n.startsWith(prefix)) continue;
    const num = Number(n.slice(prefix.length));
    if (Number.isFinite(num) && num > max) max = num;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}
