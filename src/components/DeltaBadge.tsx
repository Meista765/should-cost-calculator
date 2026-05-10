import { formatKRW } from '../lib/format';

type Props = { value: number; baseline?: number; showPercent?: boolean };

export function DeltaBadge({ value, baseline, showPercent }: Props) {
  if (!Number.isFinite(value) || value === 0) return <span className="delta delta-zero">—</span>;
  const arrow = value > 0 ? '▲' : '▼';
  const cls = value > 0 ? 'delta delta-up' : 'delta delta-down';
  const pct =
    showPercent && baseline !== undefined && baseline !== 0
      ? ` (${((value / baseline) * 100).toFixed(1)}%)`
      : '';
  return (
    <span className={cls}>
      {arrow} {formatKRW(Math.abs(value))}
      {pct}
    </span>
  );
}
