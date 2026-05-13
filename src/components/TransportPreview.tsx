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
            <strong>{fmtInt(trans.effectiveLoad)}</strong>
            <span>EA/회</span>
          </span>
        </div>
      )}
      <div className="transport-preview-meta">
        {trans.kgPerTrip != null && (
          <span className={trans.overWeight ? 'meta-bad' : 'meta-ok'}>
            회당 {fmtNum(trans.kgPerTrip, 0)} kg
            {trans.maxKg != null && (
              <> / 한계 {fmtNum(trans.maxKg, 0)} kg {trans.overWeight ? '초과' : '✓'}</>
            )}
          </span>
        )}
        {trans.m3PerTrip != null && (
          <span className={trans.overVolume ? 'meta-bad' : 'meta-ok'}>
            회당 {fmtNum(trans.m3PerTrip, 2)} m³
            {trans.maxM3 != null && (
              <> / 한계 {fmtNum(trans.maxM3, 2)} m³ {trans.overVolume ? '초과' : '✓'}</>
            )}
          </span>
        )}
        {trans.trips > 0 && batch > 0 && (
          <span>
            필요 {fmtInt(trans.trips)}회 · 총 {formatKRW(trans.total)} · {formatKRW(trans.perEa)}/EA
          </span>
        )}
      </div>
    </div>
  );
}
