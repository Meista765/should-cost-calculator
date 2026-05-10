import type { CostBreakdown, Db, FormSlice } from '../types/domain';
import { simulateMaterialChange, simulateThicknessChange } from '../lib/simulate';
import { lookupGravity } from '../lib/lookup';
import { formatKRW, formatKg, formatPercent } from '../lib/format';
import { DeltaBadge } from './DeltaBadge';

type Props = { asIs: FormSlice; asIsBreakdown: CostBreakdown; db: Db };

const volFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

export function CaseOneSimulator({ asIs, asIsBreakdown, db }: Props) {
  return (
    <section className="case-card">
      <h2>CASE 1 · 자동 시뮬레이션</h2>
      <p className="muted">
        AS-IS 입력값을 기준으로 ① 동일 강종에서 두께만 변경, ② 동일 두께에서 강종만 변경했을 때의
        가격 영향을 자동으로 보여줍니다.
      </p>

      <h3>① 두께 변경 (동일 강종)</h3>
      <ThicknessTable asIs={asIs} asIsBreakdown={asIsBreakdown} db={db} />

      <h3>② 강종 변경 (동일 두께)</h3>
      <MaterialTable asIs={asIs} asIsBreakdown={asIsBreakdown} db={db} />

      <p className="footnote">
        * 두께 변경 시 폭/피치는 그대로 유지하고 체적만 두께 비율로 보정합니다 (V = V₀ / t₀ × t).
      </p>
    </section>
  );
}

function ThicknessTable({ asIs, asIsBreakdown, db }: Props) {
  if (!asIs.grade || asIs.thickness == null || asIs.partVolume == null) {
    return <p className="muted">강종/두께/체적을 입력하면 표시됩니다.</p>;
  }
  if (asIsBreakdown.unavailable || asIsBreakdown.errors.length > 0) {
    return <p className="muted">시뮬레이션을 보려면 AS-IS 입력을 먼저 유효하게 채워주세요.</p>;
  }
  const variants = simulateThicknessChange(asIs, asIsBreakdown, db);
  if (variants.length === 0) return <p className="muted">동일 강종 두께 데이터가 없습니다.</p>;
  return (
    <div className="table-scroll">
      <table className="variant-table">
        <caption className="sr-only">동일 강종에서 두께만 변경했을 때의 원가 비교</caption>
        <thead>
          <tr>
            <th scope="col">두께(mm)</th>
            <th scope="col">추정 체적(mm³)</th>
            <th scope="col">체적 변화</th>
            <th scope="col">원소재 중량</th>
            <th scope="col">재료비</th>
            <th scope="col">가공비</th>
            <th scope="col">총원가</th>
            <th scope="col">vs AS-IS</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const isCurrent = v.thickness === asIs.thickness;
            if (v.breakdown.unavailable) {
              return (
                <tr key={v.thickness} className={isCurrent ? 'current' : ''}>
                  <td className="num">{v.thickness}</td>
                  <td className="num">{volFmt.format(Math.round(v.estimatedVolume))}</td>
                  <td className="num">{formatPercent(v.deltaVolumeRatio)}</td>
                  <td colSpan={5} className="muted">
                    {v.breakdown.unavailable.message}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={v.thickness} className={isCurrent ? 'current' : ''}>
                <td className="num">{v.thickness}</td>
                <td className="num">{volFmt.format(Math.round(v.estimatedVolume))}</td>
                <td className="num">
                  {isCurrent ? (
                    <span className="muted">현재</span>
                  ) : (
                    formatPercent(v.deltaVolumeRatio)
                  )}
                </td>
                <td className="num">{formatKg(v.breakdown.rawWeightKg)}</td>
                <td className="num">{formatKRW(v.breakdown.materialCost)}</td>
                <td className="num">{formatKRW(v.breakdown.processCost)}</td>
                <td className="num strong">{formatKRW(v.breakdown.totalCost)}</td>
                <td className="num">
                  {isCurrent ? <span className="muted">현재</span> : <DeltaBadge value={v.deltaTotal} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MaterialTable({ asIs, asIsBreakdown, db }: Props) {
  if (!asIs.grade || asIs.thickness == null) {
    return <p className="muted">강종/두께를 입력하면 표시됩니다.</p>;
  }
  if (asIsBreakdown.unavailable || asIsBreakdown.errors.length > 0) {
    return <p className="muted">시뮬레이션을 보려면 AS-IS 입력을 먼저 유효하게 채워주세요.</p>;
  }
  const variants = simulateMaterialChange(asIs, asIsBreakdown, db);
  if (variants.length === 0) return <p className="muted">동일 두께를 가진 강종 후보가 없습니다.</p>;
  return (
    <div className="table-scroll">
      <table className="variant-table">
        <caption className="sr-only">동일 두께에서 강종만 변경했을 때의 원가 비교</caption>
        <thead>
          <tr>
            <th scope="col">강종</th>
            <th scope="col">비중(g/cm³)</th>
            <th scope="col">재료비</th>
            <th scope="col">가공비</th>
            <th scope="col">총원가</th>
            <th scope="col">vs AS-IS</th>
            <th scope="col">비고</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => {
            const isCurrent = v.grade === asIs.grade;
            const gravityInfo = lookupGravity(v.grade, db);
            return (
              <tr key={v.grade} className={isCurrent ? 'current' : ''}>
                <td>{v.displayName}</td>
                <td className="num">{gravityInfo ? gravityInfo.gravity.toFixed(2) : '—'}</td>
                <td className="num">{formatKRW(v.breakdown.materialCost)}</td>
                <td className="num">{formatKRW(v.breakdown.processCost)}</td>
                <td className="num strong">{formatKRW(v.breakdown.totalCost)}</td>
                <td className="num">
                  {isCurrent ? <span className="muted">현재</span> : <DeltaBadge value={v.deltaTotal} />}
                </td>
                <td>
                  {v.method === 'interpolate' ? (
                    <span className="badge badge-warn">보간 추정</span>
                  ) : (
                    <span className="badge badge-ok">exact</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
