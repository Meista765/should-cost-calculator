const krwInt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const krwOne = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatKRW(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${krwInt.format(Math.round(v))}원`;
}

export function formatKRWPrecise(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${krwOne.format(v)}원`;
}

export function formatKg(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(4)} kg`;
}

export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(1)}%`;
}
