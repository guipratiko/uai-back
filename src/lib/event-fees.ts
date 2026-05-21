/** % taxa ao comprador quando o evento não define (admin em branco). */
export const DEFAULT_BUYER_FEE_PERCENT = 10;

export function resolveBuyerFeePercent(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return DEFAULT_BUYER_FEE_PERCENT;
  return Math.min(100, Math.max(0, Number(value)));
}

export function resolvePlatformFeePercent(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

export function parseFeePercentInput(
  value: number | string | null | undefined,
): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.min(100, Math.max(0, n));
}
