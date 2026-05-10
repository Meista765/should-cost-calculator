import type { CostBreakdown } from '../types/domain';
import { formatKRW, formatKg } from '../lib/format';

type Props = { title: string; breakdown: CostBreakdown };

export function ResultsPanel({ title, breakdown }: Props) {
  if (breakdown.unavailable) {
    return (
      <section className="results-card">
        <h2>{title}</h2>
        <p className="muted">{breakdown.unavailable.message}</p>
      </section>
    );
  }
  return (
    <section className="results-card">
      <h2>{title}</h2>
      <div className="results-grid">
        <Row label="원소재 중량" value={formatKg(breakdown.rawWeightKg)} />
        <Row label="제품 중량" value={formatKg(breakdown.partWeightKg)} />
        <Row label="스크랩 중량" value={formatKg(breakdown.scrapWeightKg)} />
        <Row label="재료비" value={formatKRW(breakdown.materialCost)} />
        <Row label="가공비" value={formatKRW(breakdown.processCost)} />
        <Row label="총원가 (KRW/EA)" value={formatKRW(breakdown.totalCost)} strong />
      </div>
      {breakdown.errors.length > 0 && (
        <ul className="errors-list" role="alert">
          {breakdown.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {breakdown.warnings.length > 0 && (
        <ul className="warnings" role="status" aria-live="polite">
          {breakdown.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <div className={`r-label${strong ? ' strong' : ''}`}>{label}</div>
      <div className={`r-value${strong ? ' strong' : ''}`}>{value}</div>
    </>
  );
}
