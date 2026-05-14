import type { Db, UnifiedFormSlice } from '../types/domain';
import { calcTransport } from '../lib/calcSheet';
import { formatKRW } from '../lib/format';

type Props = { value: UnifiedFormSlice; db: Db };

const fmtInt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const fmtNum = (n: number, digits = 2) =>
  n.toLocaleString('ko-KR', { maximumFractionDigits: digits });

export function TransportPreview({ value, db }: Props) {
  const trans = calcTransport(value, db);
  if (trans.loadSource === 'none' || !value.transMethod) return null;

  const batch = value.batchQty ?? 0;
  const hierarchy = trans.loadSource === 'hierarchy';
  const hasWeight = trans.weightCapacityEa != null && trans.partWeightKg != null && trans.maxKg != null;
  const hasVolume = trans.volumeCapacityEa != null && trans.partBoxM3 != null && trans.maxM3 != null;
  const showCompare = hierarchy && (hasWeight || hasVolume);
  const userLoad = trans.userLoadEa ?? trans.effectiveLoad;
  const utilizationPct =
    trans.capacityEa != null && trans.capacityEa > 0 ? (userLoad / trans.capacityEa) * 100 : null;

  return (
    <div className="transport-preview" aria-label="운반 적재 미리보기">
      {hierarchy && (
        <div className="transport-chain">
          <span className="chain-box">
            <em>box</em>
            <strong>{fmtInt(trans.eaPerBox ?? 0)}</strong>
            <span>EA</span>
          </span>
          <span className="chain-op">×</span>
          <span className="chain-box">
            <em>pallet</em>
            <strong>{fmtInt(trans.boxPerPallet ?? 0)}</strong>
            <span>box</span>
          </span>
          <span className="chain-op">×</span>
          <span className="chain-box">
            <em>car</em>
            <strong>{fmtInt(trans.palletPerCar ?? 0)}</strong>
            <span>pallet</span>
          </span>
          <span className="chain-op">=</span>
          <span className="chain-box chain-total">
            <em>회당</em>
            <strong>{fmtInt(userLoad)}</strong>
            <span>EA/회</span>
          </span>
        </div>
      )}
      {showCompare && (
        <div className="transport-compare" aria-label="무게/체적 기준 비교">
          {hasWeight && (
            <div
              className={`compare-row${trans.bindingConstraint === 'weight' ? ' binding' : ''}`}
            >
              <span className="compare-label">무게 기준</span>
              <span className="compare-expr">
                {fmtNum(trans.maxKg ?? 0, 0)} kg ÷ {fmtNum(trans.partWeightKg ?? 0, 3)} kg/EA
              </span>
              <span className="compare-result">
                = <b>{fmtInt(trans.weightCapacityEa ?? 0)}</b> EA/회
              </span>
              {trans.bindingConstraint === 'weight' && (
                <span className="binding-mark">◀ 선행 한계</span>
              )}
            </div>
          )}
          {hasVolume && (
            <div
              className={`compare-row${trans.bindingConstraint === 'volume' ? ' binding' : ''}`}
            >
              <span className="compare-label">체적 기준</span>
              <span className="compare-expr">
                {fmtNum(trans.maxM3 ?? 0, 0)} m³ ÷ {fmtNum(trans.partBoxM3 ?? 0, 4)} m³/EA
              </span>
              <span className="compare-result">
                = <b>{fmtInt(trans.volumeCapacityEa ?? 0)}</b> EA/회
              </span>
              {trans.bindingConstraint === 'volume' && (
                <span className="binding-mark">◀ 선행 한계</span>
              )}
            </div>
          )}
          <div className="compare-row user-load">
            <span className="compare-label">사용자 적재</span>
            <span className="compare-expr">
              {trans.eaPerBox ?? 0} × {trans.boxPerPallet ?? 0} × {trans.palletPerCar ?? 0}
            </span>
            <span className="compare-result">
              = <b>{fmtInt(userLoad)}</b> EA/회
            </span>
          </div>
          <div className={`compare-row applied-load${trans.clipped ? ' over' : ' ok'}`}>
            <span className="compare-label">적용 적재</span>
            <span className="compare-expr">
              {trans.clipped
                ? `min(${fmtInt(userLoad)}, ${fmtInt(trans.capacityEa ?? 0)})`
                : ''}
            </span>
            <span className="compare-result">
              = <b>{fmtInt(trans.appliedLoadEa ?? userLoad)}</b> EA/회
              {trans.clipped ? (
                <>
                  {' '}
                  ⚠ 선행 한계 클립
                  {utilizationPct != null && <> (사용률 {fmtNum(utilizationPct, 0)}%)</>}
                </>
              ) : (
                <>
                  {' '}
                  ✓ 적정
                  {utilizationPct != null && <> (사용률 {fmtNum(utilizationPct, 0)}%)</>}
                </>
              )}
            </span>
          </div>
        </div>
      )}
      {hierarchy && !showCompare && (
        <div className="transport-compare-hint">
          {trans.maxKg == null && trans.maxM3 == null
            ? '차량 톤수를 선택하면 무게/체적 기준 비교가 표시됩니다.'
            : '제품 체적·재질 또는 외관 치수를 입력하면 차량 한계 자동 검증이 표시됩니다.'}
        </div>
      )}
      <div className="transport-preview-meta">
        {trans.trips > 0 && batch > 0 && (
          <span>
            필요 {fmtInt(trans.trips)}회 · 총 {formatKRW(trans.total)} · {formatKRW(trans.perEa)}/EA
          </span>
        )}
      </div>
    </div>
  );
}
