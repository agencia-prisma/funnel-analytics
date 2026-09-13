export function analyticsChangePct(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10_000) / 100;
}
