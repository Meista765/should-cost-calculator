import type { CostBreakdown } from '../types/domain';
import { formatKRW, formatKg } from '../lib/format';

type Props = { title: string; breakdown: CostBreakdown };

export function ResultsPanel({ title, breakdown }: Props) {
  if (breakdown.unavailable) {
    return (
      <section className="results-card">
        <div className="section-heading">
          <h2>{title}</h2>
          <span className="status-pill">입력 대기</span>
        </div>
        <div className="empty-state" role="status" aria-live="polite">
          <strong>계산 준비 중</strong>
          <p>{breakdown.unavailable.message}</p>
        </div>
      </section>
    );
  }
  const hasErrors = breakdown.errors.length > 0;
  const hasWarnings = breakdown.warnings.length > 0;
  return (
    <section className="results-card">
      <div className="section-heading">
        <h2>{title}</h2>
        {hasErrors ? (
          <span className="status-pill status-error">확인 필요</span>
        ) : hasWarnings ? (
          <span className="status-pill status-warn">추정 포함</span>
        ) : (
          <span className="status-pill status-ready">계산 완료</span>
        )}
      </div>
      <div className="results-grid">
        <Row label="원소재 중량" value={formatKg(breakdown.rawWeightKg)} />
        <Row label="제품 중량" value={formatKg(breakdown.partWeightKg)} />
        <Row label="스크랩 중량" value={formatKg(breakdown.scrapWeightKg)} />
        <Row label="재료비" value={formatKRW(breakdown.materialCost)} />
        <Row label="가공비" value={formatKRW(breakdown.processCost)} />
        <Row label="총원가" value={formatKRW(breakdown.totalCost)} strong />
      </div>
      {breakdown.errors.length > 0 && (
        <ul className="errors-list" role="alert">
          <li className="list-title">입력값을 확인하세요.</li>
          {breakdown.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {breakdown.warnings.length > 0 && (
        <ul className="warnings" role="status" aria-live="polite">
          <li className="list-title">참고 사항</li>
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
    <div className={`result-row${strong ? ' total-row' : ''}`}>
      <div className={`r-label${strong ? ' strong' : ''}`}>{label}</div>
      <div className={`r-value${strong ? ' strong' : ''}`}>{value}</div>
      {strong && <div className="r-unit">KRW/EA</div>}
    </div>
  );
}
