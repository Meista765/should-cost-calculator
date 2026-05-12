import type { CostBreakdown } from '../types/domain';
import { formatKRW, formatKg, formatPercent } from '../lib/format';

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
  const hasSheetLines =
    breakdown.laserCost != null ||
    breakdown.bendCost != null ||
    breakdown.nctCost != null ||
    breakdown.cleanCost != null ||
    breakdown.weldCost != null ||
    breakdown.paintCost != null ||
    (breakdown.transportCost ?? 0) > 0 ||
    (breakdown.postCost ?? 0) > 0;
  const hasMargin = breakdown.shouldCost != null;

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
        {hasSheetLines ? (
          <>
            {breakdown.laserCost != null && breakdown.laserCost > 0 && (
              <Row label="레이저" value={formatKRW(breakdown.laserCost)} />
            )}
            {breakdown.bendCost != null && breakdown.bendCost > 0 && (
              <Row label="절곡" value={formatKRW(breakdown.bendCost)} />
            )}
            {breakdown.nctCost != null && breakdown.nctCost > 0 && (
              <Row label="NCT" value={formatKRW(breakdown.nctCost)} />
            )}
            {breakdown.cleanCost != null && breakdown.cleanCost > 0 && (
              <Row label="세척" value={formatKRW(breakdown.cleanCost)} />
            )}
            {breakdown.weldCost != null && breakdown.weldCost > 0 && (
              <Row label="용접" value={formatKRW(breakdown.weldCost)} />
            )}
            {breakdown.paintCost != null && breakdown.paintCost > 0 && (
              <Row label="도장" value={formatKRW(breakdown.paintCost)} />
            )}
            {breakdown.transportCost != null && breakdown.transportCost > 0 && (
              <Row label="운반비" value={formatKRW(breakdown.transportCost)} />
            )}
            {breakdown.postCost != null && breakdown.postCost > 0 && (
              <Row label="후공정 추가" value={formatKRW(breakdown.postCost)} />
            )}
          </>
        ) : (
          <Row label="가공비" value={formatKRW(breakdown.processCost)} />
        )}
        {hasMargin ? (
          <>
            <Row label="직접비" value={formatKRW(breakdown.directCost ?? breakdown.totalCost)} />
            {breakdown.overheadCost != null && (
              <Row
                label={`일반관리비 (${formatPercent(breakdown.appliedOverheadRate ?? 0)})`}
                value={formatKRW(breakdown.overheadCost)}
              />
            )}
            {breakdown.profitCost != null && (
              <Row
                label={`이윤 (${formatPercent(breakdown.appliedMarginRate ?? 0)})`}
                value={formatKRW(breakdown.profitCost)}
              />
            )}
            <Row label="Should-Cost" value={formatKRW(breakdown.shouldCost!)} strong />
            {breakdown.verdict && (
              <Row
                label={`견적 비교 (${formatKRW(breakdown.quotePerEa ?? 0)})`}
                value={`${breakdown.verdict} · ${formatPercent(breakdown.diffPct ?? 0)}`}
              />
            )}
          </>
        ) : (
          <Row label="총원가" value={formatKRW(breakdown.totalCost)} strong />
        )}
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
