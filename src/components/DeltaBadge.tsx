import { formatKRW } from '../lib/format';

type Props = { value: number; baseline?: number; showPercent?: boolean };

export function DeltaBadge({ value, baseline, showPercent }: Props) {
  if (!Number.isFinite(value) || value === 0) {
    return (
      <span className="delta delta-zero" aria-label="변동 없음">
        —
      </span>
    );
  }
  const direction = value > 0 ? '증가' : '감소';
  const arrow = value > 0 ? '▲' : '▼';
  const cls = value > 0 ? 'delta delta-up' : 'delta delta-down';
  const pct =
    showPercent && baseline !== undefined && baseline !== 0
      ? ` (${((value / baseline) * 100).toFixed(1)}%)`
      : '';
  const amount = formatKRW(Math.abs(value));
  return (
    <span className={cls} aria-label={`${direction} ${amount}${pct}`}>
      <span aria-hidden="true">
        {arrow} {amount}
        {pct}
      </span>
    </span>
  );
}
