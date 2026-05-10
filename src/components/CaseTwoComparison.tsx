import type { CostBreakdown } from '../types/domain';
import { formatKRW, formatPercent } from '../lib/format';
import { DeltaBadge } from './DeltaBadge';

type Props = {
  enabled: boolean;
  onToggle: () => void;
  onCopyFromAsIs: () => void;
  asIsBreakdown: CostBreakdown;
  toBeBreakdown: CostBreakdown;
};

export function CaseTwoComparison({
  enabled,
  onToggle,
  onCopyFromAsIs,
  asIsBreakdown,
  toBeBreakdown,
}: Props) {
  if (!enabled) {
    return (
      <section className="case-card">
        <h2>CASE 2 · AS-IS / TO-BE 직접 비교 (선택)</h2>
        <p className="muted">변경 후(TO-BE) 사양도 직접 입력해 재료비/가공비 변화를 분리하여 볼 수 있습니다.</p>
        <button className="primary" onClick={onToggle}>
          TO-BE 폼 펼치기
        </button>
      </section>
    );
  }

  const matDelta = toBeBreakdown.materialCost - asIsBreakdown.materialCost;
  const procDelta = toBeBreakdown.processCost - asIsBreakdown.processCost;
  const totalDelta = toBeBreakdown.totalCost - asIsBreakdown.totalCost;

  const unavailable =
    asIsBreakdown.unavailable ||
    toBeBreakdown.unavailable ||
    asIsBreakdown.errors.length > 0 ||
    toBeBreakdown.errors.length > 0;

  return (
    <section className="case-card">
      <div className="row-inline">
        <h2>CASE 2 · AS-IS / TO-BE 직접 비교</h2>
        <div className="spacer" />
        <button onClick={onCopyFromAsIs}>AS-IS 복사 →</button>
        <button onClick={onToggle}>접기</button>
      </div>
      {unavailable ? (
        <p className="empty-note">AS-IS와 TO-BE 양쪽 모두 유효한 값이 있어야 비교가 표시됩니다.</p>
      ) : (
        <div className="delta-cards">
          <DeltaCard
            title="재료비 변화"
            asIs={asIsBreakdown.materialCost}
            toBe={toBeBreakdown.materialCost}
            delta={matDelta}
          />
          <DeltaCard
            title="가공비 변화"
            asIs={asIsBreakdown.processCost}
            toBe={toBeBreakdown.processCost}
            delta={procDelta}
          />
          <DeltaCard
            title="총원가 변화"
            asIs={asIsBreakdown.totalCost}
            toBe={toBeBreakdown.totalCost}
            delta={totalDelta}
            strong
          />
        </div>
      )}
    </section>
  );
}

function DeltaCard({
  title,
  asIs,
  toBe,
  delta,
  strong,
}: {
  title: string;
  asIs: number;
  toBe: number;
  delta: number;
  strong?: boolean;
}) {
  return (
    <div className={`delta-card${strong ? ' strong' : ''}`}>
      <div className="dc-title">{title}</div>
      <div className="dc-row">
        <span>AS-IS</span>
        <span className="num">{formatKRW(asIs)}</span>
      </div>
      <div className="dc-row">
        <span>TO-BE</span>
        <span className="num">{formatKRW(toBe)}</span>
      </div>
      <div className="dc-delta">
        <DeltaBadge value={delta} baseline={asIs} showPercent />
        {asIs !== 0 && (
          <span className="muted">{formatPercent(delta / asIs)}</span>
        )}
      </div>
    </div>
  );
}
