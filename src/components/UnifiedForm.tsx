import type {
  CostBreakdown,
  Db,
  PostCostRow,
  ProcessInput,
  ProcessMethod,
  TransportMethod,
  UnifiedFormSlice,
  WeldKind,
  WeldRow,
  WeldRowDetail,
} from '../types/domain';
import { listAllMaterials } from '../lib/lookup';
import { ProcessRowList } from './ProcessRowList';
import { NctTable } from './NctTable';
import { TransportPreview } from './TransportPreview';
import { PostCostPreview } from './PostCostPreview';
import { PressPreview } from './PressPreview';
import { FormulaRow, SectionFormula, fmtN } from './SectionFormula';
import { TransportLoadInputs } from './transport';
import { FoldableProcessCard } from './FoldableProcessCard';

type Props = {
  title: string;
  value: UnifiedFormSlice;
  onPatch: (patch: Partial<UnifiedFormSlice>) => void;
  onSetMethod: (method: ProcessMethod) => void;
  onSetProcessCount: (n: number) => void;
  onPatchProcess: (index: number, patch: Partial<ProcessInput>) => void;
  db: Db;
  breakdown: CostBreakdown;
};

function parseFiniteNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function NumberInput(props: {
  label: string;
  unit?: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  placeholder?: string;
  hint?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const { label, unit, value, onChange, step = 0.1, min = 0, placeholder, hint, ariaLabel, disabled } = props;
  const hasRangeError = !disabled && value != null && value < min;
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {unit && <em className="unit">({unit})</em>}
      </span>
      <input
        type="number"
        step={step}
        min={min}
        value={value ?? ''}
        onChange={(e) => onChange(parseFiniteNumber(e.target.value))}
        placeholder={placeholder}
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        className={hasRangeError ? 'input-invalid' : undefined}
        aria-invalid={hasRangeError}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function PostCostTable(props: {
  rows: PostCostRow[];
  onChange: (next: PostCostRow[]) => void;
}) {
  const { rows, onChange } = props;
  const setLabel = (i: number, v: string) =>
    onChange(rows.map((r, ri) => (ri === i ? { ...r, label: v } : r)));
  const setCost = (i: number, v: number) =>
    onChange(rows.map((r, ri) => (ri === i ? { ...r, costEa: v } : r)));
  const insertEmpty = (i: number) => {
    const next = rows.slice();
    next.splice(i + 1, 0, { label: '', costEa: 0 });
    onChange(next);
  };
  const dup = (i: number) => {
    const next = rows.slice();
    next.splice(i + 1, 0, { ...rows[i] });
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const del = (i: number) => onChange(rows.filter((_, ri) => ri !== i));
  const add = () => onChange([...rows, { label: '', costEa: 0 }]);

  return (
    <div className="admin-table-wrap">
      <table className="admin-grid-table">
        <thead>
          <tr>
            <th>항목</th>
            <th style={{ width: '140px' }}>원/EA</th>
            <th style={{ width: '152px' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="muted small" style={{ textAlign: 'center' }}>
                행을 추가하세요
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={i}>
              <td>
                <input
                  type="text"
                  value={row.label}
                  placeholder="예: 도금, 외주 검사"
                  aria-label={`후공정 ${i + 1} 항목`}
                  onChange={(e) => setLabel(i, e.target.value)}
                />
              </td>
              <td>
                <input
                  type="number"
                  step={1}
                  min={0}
                  inputMode="decimal"
                  value={row.costEa}
                  aria-label={`후공정 ${i + 1} 단가`}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    if (!isNaN(n)) setCost(i, n);
                  }}
                />
              </td>
              <td>
                <div className="admin-row-actions">
                  <button type="button" className="admin-row-btn" title="이 행 아래에 빈 행 삽입" onClick={() => insertEmpty(i)} aria-label="빈 행 삽입">＋</button>
                  <button type="button" className="admin-row-btn" title="이 행 아래에 복제 삽입" onClick={() => dup(i)} aria-label="복제">⎘</button>
                  <button type="button" className="admin-row-btn" title="위로" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">↑</button>
                  <button type="button" className="admin-row-btn" title="아래로" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="아래로">↓</button>
                  <button type="button" className="admin-row-btn admin-row-del" title="삭제" onClick={() => del(i)} aria-label="삭제">−</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="admin-add-row" onClick={add}>
        <span className="admin-add-row-icon" aria-hidden>+</span>
        <span>맨 아래에 행 추가</span>
      </button>
    </div>
  );
}

const WELD_KIND_OPTIONS: WeldKind[] = ['TIG', 'MIG', 'MAG', 'CO2', 'Robot', 'Spot'];

function WeldRowsTable(props: {
  rows: WeldRow[];
  onChange: (next: WeldRow[]) => void;
}) {
  const { rows, onChange } = props;
  const patchRow = (i: number, patch: Partial<WeldRow>) =>
    onChange(rows.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));
  const insertEmpty = (i: number) => {
    const next = rows.slice();
    next.splice(i + 1, 0, { kind: 'TIG', posFactor: 1 });
    onChange(next);
  };
  const dup = (i: number) => {
    const next = rows.slice();
    next.splice(i + 1, 0, { ...rows[i] });
    onChange(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const del = (i: number) => onChange(rows.filter((_, ri) => ri !== i));
  const add = () => onChange([...rows, { kind: 'TIG', posFactor: 1 }]);

  return (
    <div className="admin-table-wrap">
      <table className="admin-grid-table">
        <thead>
          <tr>
            <th style={{ width: '90px' }}>용접 종류</th>
            <th style={{ width: '110px' }}>용접 길이(mm)</th>
            <th style={{ width: '110px' }}>점용접 점수(점)</th>
            <th style={{ width: '90px' }}>자세계수</th>
            <th style={{ width: '152px' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted small" style={{ textAlign: 'center' }}>
                행을 추가하세요
              </td>
            </tr>
          )}
          {rows.map((row, i) => {
            const isSpot = row.kind === 'Spot';
            return (
              <tr key={i}>
                <td>
                  <select
                    value={row.kind}
                    aria-label={`용접 ${i + 1} 종류`}
                    onChange={(e) => patchRow(i, { kind: e.target.value as WeldKind })}
                  >
                    {WELD_KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step={1}
                    min={0}
                    inputMode="decimal"
                    value={row.lengthMm ?? ''}
                    disabled={isSpot}
                    aria-label={`용접 ${i + 1} 길이`}
                    onChange={(e) => patchRow(i, { lengthMm: parseFiniteNumber(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step={1}
                    min={0}
                    inputMode="decimal"
                    value={row.spots ?? ''}
                    disabled={!isSpot}
                    aria-label={`용접 ${i + 1} 점수`}
                    onChange={(e) => patchRow(i, { spots: parseFiniteNumber(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    inputMode="decimal"
                    value={row.posFactor ?? ''}
                    placeholder="1.0"
                    aria-label={`용접 ${i + 1} 자세계수`}
                    onChange={(e) => patchRow(i, { posFactor: parseFiniteNumber(e.target.value) })}
                  />
                </td>
                <td>
                  <div className="admin-row-actions">
                    <button type="button" className="admin-row-btn" title="이 행 아래에 빈 행 삽입" onClick={() => insertEmpty(i)} aria-label="빈 행 삽입">＋</button>
                    <button type="button" className="admin-row-btn" title="이 행 아래에 복제 삽입" onClick={() => dup(i)} aria-label="복제">⎘</button>
                    <button type="button" className="admin-row-btn" title="위로" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로">↑</button>
                    <button type="button" className="admin-row-btn" title="아래로" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="아래로">↓</button>
                    <button type="button" className="admin-row-btn admin-row-del" title="삭제" onClick={() => del(i)} aria-label="삭제">−</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="admin-add-row" onClick={add}>
        <span className="admin-add-row-icon" aria-hidden>+</span>
        <span>맨 아래에 행 추가</span>
      </button>
    </div>
  );
}

function WeldRowsPreview({ details, thkMm }: { details: WeldRowDetail[] | undefined; thkMm: number }) {
  if (!details || details.length === 0) return null;
  return (
    <div className="section-formula" aria-label="용접 행별 계산식">
      <div className="sf-head">행별 계산식</div>
      <div className="sf-body">
        {details.map((d, i) => {
          const ratePerMin = d.rate / 60;
          if (d.kind === 'Spot') {
            return (
              <FormulaRow key={i} label={`#${i + 1} ${d.kind}`}>
                {fmtN(d.spots)} × {fmtN(d.spotSec, 2)}/60 × {fmtN(d.posFactor, 2)} = {fmtN(d.weldMin, 3)} 분/EA × {fmtN(ratePerMin, 2)} 원/분 → <b>{fmtN(d.perEa)} 원/EA</b>
              </FormulaRow>
            );
          }
          return (
            <FormulaRow key={i} label={`#${i + 1} ${d.kind}`}>
              lookup({d.kind}, {fmtN(thkMm, 2)}mm)={fmtN(d.speed)} mm/분, {fmtN(d.lengthMm)}/{fmtN(d.speed)} × {fmtN(d.posFactor, 2)} = {fmtN(d.weldMin, 3)} 분/EA × {fmtN(ratePerMin, 2)} 원/분 → <b>{fmtN(d.perEa)} 원/EA</b>
            </FormulaRow>
          );
        })}
      </div>
    </div>
  );
}

function PercentInput(props: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  hint?: string;
}) {
  const { label, value, onChange, placeholder, hint } = props;
  return (
    <label className="field">
      <span className="field-label">
        {label}
        <em className="unit">(%)</em>
      </span>
      <input
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={value == null ? '' : value * 100}
        onChange={(e) => {
          const n = parseFiniteNumber(e.target.value);
          onChange(n == null ? undefined : Math.max(0, Math.min(1, n / 100)));
        }}
        placeholder={placeholder}
        inputMode="decimal"
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function UnifiedForm({
  title,
  value,
  onPatch,
  onSetMethod,
  onSetProcessCount,
  onPatchProcess,
  db,
  breakdown,
}: Props) {
  const materials = listAllMaterials(db);
  const freightTons = db.freightMatrix.map((r) => r.tonnage);
  const ownTons = db.ownVehicleMatrix.map((r) => r.tonnage);
  const cleanHelpers = db.cleanMatrix.map((r) => r.helpers);
  const unavailable = breakdown.unavailable;

  return (
    <section className="form-card">
      <div className="row-inline">
        <h2>{title}</h2>
        <div className="spacer" />
        <div className="mode-toggle" role="tablist" aria-label="공법">
          <button
            type="button"
            role="tab"
            aria-selected={value.processMethod === 'press'}
            className={`mode-tab${value.processMethod === 'press' ? ' active' : ''}`}
            onClick={() => onSetMethod('press')}
          >
            프레스
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={value.processMethod === 'sheet'}
            className={`mode-tab${value.processMethod === 'sheet' ? ' active' : ''}`}
            onClick={() => onSetMethod('sheet')}
          >
            판금
          </button>
        </div>
      </div>

      <fieldset>
        <legend className="legend-with-action">
          <span>원소재</span>
          <label className="legend-check">
            <input
              type="checkbox"
              checked={!!value.priceOverride}
              onChange={(e) => onPatch({ priceOverride: e.target.checked })}
              aria-label={`${title} 단가 수동 입력`}
            />
            <span>단가 수동 입력</span>
          </label>
        </legend>
        <div className="grid grid-3">
          <label className="field">
            <span className="field-label">재질</span>
            <select
              value={value.material ?? ''}
              onChange={(e) => onPatch({ material: e.target.value || undefined })}
              aria-label={`${title} 재질`}
            >
              <option value="">재질 선택</option>
              {materials.map((m) => (
                <option key={m.grade} value={m.grade}>
                  {m.group ?? '기타'} / {m.gradeRaw} / 비중: {m.density.toFixed(2)}
                </option>
              ))}
            </select>
          </label>
          <NumberInput label="두께" unit="mm" value={value.thkMm} step={0.1} onChange={(v) => onPatch({ thkMm: v })} placeholder="예: 2.0" />
          <NumberInput label="폭" unit="mm" value={value.xMm} step={1} onChange={(v) => onPatch({ xMm: v })} placeholder="예: 200" />
          <NumberInput label="길이" unit="mm" value={value.yMm} step={1} onChange={(v) => onPatch({ yMm: v })} placeholder="예: 150" />
          <NumberInput label="연간 예상물량" unit="EA/년" value={value.batchQty} step={1} onChange={(v) => onPatch({ batchQty: v })} placeholder="예: 10,000" />
          <NumberInput
            label="재료 단가"
            unit="원/kg"
            value={value.matPrice}
            step={1}
            onChange={(v) => onPatch({ matPrice: v })}
            placeholder={value.priceOverride ? '직접 입력 (원/kg)' : 'OFF — DB 자동조회 사용'}
            disabled={!value.priceOverride}
          />
          <NumberInput
            label="스크랩 단가"
            unit="원/kg"
            value={value.scrapPrice}
            step={1}
            onChange={(v) => onPatch({ scrapPrice: v })}
            placeholder={value.priceOverride ? '직접 입력 (원/kg)' : 'OFF — DB 자동조회 사용'}
            disabled={!value.priceOverride}
          />
          <PercentInput
            label="스크랩 회수율"
            value={value.scrapRecovery}
            onChange={(v) => onPatch({ scrapRecovery: v })}
            placeholder="예: 90"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>제품</legend>
        <div className="grid grid-3">
          <NumberInput label="체적" unit="mm³" value={value.volMm3} step={1} onChange={(v) => onPatch({ volMm3: v })} placeholder="예: 50000" />
          <NumberInput label="너비" unit="mm" value={value.partWidth} onChange={(v) => onPatch({ partWidth: v })} placeholder="선택" />
          <NumberInput label="길이" unit="mm" value={value.partLength} onChange={(v) => onPatch({ partLength: v })} placeholder="선택" />
          <NumberInput label="높이" unit="mm" value={value.partHeight} onChange={(v) => onPatch({ partHeight: v })} placeholder="선택" />
        </div>
      </fieldset>

      {unavailable ? (
        <SectionFormula label="재료비" emptyMessage={unavailable.message} />
      ) : breakdown.materialDetail && (
        <SectionFormula label="재료비" result={breakdown.materialDetail.netMatCost}>
          {(() => {
            const m = breakdown.materialDetail!;
            return (
              <>
                <FormulaRow label="원소재중량">
                  X × Y × t × ρ / 1,000,000 ={' '}
                  {fmtN(m.xMm)} × {fmtN(m.yMm)} × {fmtN(m.thkMm, 2)} × {fmtN(m.density, 2)} / 1,000,000 ={' '}
                  <b>{fmtN(m.orderKg, 4)} kg</b>
                </FormulaRow>
                <FormulaRow label="제품중량">
                  {m.volumeMissing ? (
                    <>※ 체적 미입력 → 원소재중량과 동일로 가정 = <b>{fmtN(m.orderKg, 4)} kg</b></>
                  ) : (
                    <>체적 × 비중 / 1,000,000 = {fmtN(m.volMm3)} × {fmtN(m.density, 2)} / 1,000,000 = <b>{fmtN(m.netKg, 4)} kg</b></>
                  )}
                </FormulaRow>
                <FormulaRow label="스크랩회수">
                  {m.volumeMissing ? (
                    <>0 kg (체적 미입력)</>
                  ) : (
                    <>(원소재중량 − 제품중량) × 회수율 = ({fmtN(m.orderKg, 4)} − {fmtN(m.netKg, 4)}) × {fmtN(m.scrapRecovery * 100, 1)}% = <b>{fmtN(m.scrapKg, 4)} kg</b></>
                  )}
                </FormulaRow>
                <FormulaRow label="재료비">
                  {m.volumeMissing ? (
                    <>원소재중량 × 재료단가 = <b>{fmtN(m.netMatCost)} 원/EA</b> (상한값)</>
                  ) : (
                    <>제품중량 × 재료단가 − 스크랩중량 × 스크랩단가 = <b>{fmtN(m.netMatCost)} 원/EA</b></>
                  )}
                </FormulaRow>
                {m.priceWarning && (
                  <FormulaRow label="※">{m.priceWarning}</FormulaRow>
                )}
              </>
            );
          })()}
        </SectionFormula>
      )}

      {value.processMethod === 'press' ? (
        <fieldset>
          <legend>프레스 공정</legend>
          <ProcessRowList
            count={value.pressProcessCount}
            rows={value.pressProcesses}
            onSetCount={onSetProcessCount}
            onPatchRow={onPatchProcess}
            db={db}
          />
          <PressPreview detail={breakdown.pressDetail} />
        </fieldset>
      ) : (
        <>
          <fieldset>
            <legend>레이저 절단</legend>
            <div className="grid grid-3">
              <NumberInput label="외곽 둘레" unit="mm" value={value.perimeterMm} step={1} onChange={(v) => onPatch({ perimeterMm: v })} placeholder="예: 900" />
              <NumberInput label="피어싱 수" unit="회" value={value.pierceN} step={1} onChange={(v) => onPatch({ pierceN: v })} placeholder="예: 6" />
            </div>
            {breakdown.laserDetail && (breakdown.laserDetail.perimeterMm > 0 || breakdown.laserDetail.pierceN > 0) && (
              <SectionFormula label="레이저비" result={breakdown.laserDetail.laserCost}>
                {(() => {
                  const l = breakdown.laserDetail!;
                  if (l.cutSpeed === 0) {
                    return (
                      <FormulaRow label="안내">
                        재질·두께 lookup 결과 절단속도 0 — 재질·두께를 확인하세요.
                      </FormulaRow>
                    );
                  }
                  return (
                    <>
                      <FormulaRow label="절단속도">
                        lookup(재질, {fmtN(value.thkMm ?? 0, 2)} mm) = <b>{fmtN(l.cutSpeed)} mm/분</b>
                      </FormulaRow>
                      <FormulaRow label="피어싱시간">
                        lookup({fmtN(value.thkMm ?? 0, 2)} mm) = <b>{fmtN(l.pierceSec, 2)} 초/회</b>
                      </FormulaRow>
                      <FormulaRow label="절단시간">
                        둘레/속도 + 피어싱수 × 시간/60 = {fmtN(l.perimeterMm)}/{fmtN(l.cutSpeed)} + {fmtN(l.pierceN)}×{fmtN(l.pierceSec, 2)}/60 = <b>{fmtN(l.cutMin, 3)} 분/EA</b>
                      </FormulaRow>
                      <FormulaRow label="임율">
                        {l.rateKey} = <b>{fmtN(l.rate)} 원/분</b>
                      </FormulaRow>
                      <FormulaRow label="레이저비">
                        시간 × 임율 = {fmtN(l.cutMin, 3)} × {fmtN(l.rate)} = <b>{fmtN(l.laserCost)} 원/EA</b>
                      </FormulaRow>
                    </>
                  );
                })()}
              </SectionFormula>
            )}
          </fieldset>

          <fieldset>
            <legend>절곡</legend>
            <div className="grid grid-3">
              <NumberInput label="bend 수" unit="회" value={value.bendN} step={1} onChange={(v) => onPatch({ bendN: v })} placeholder="예: 2" />
            </div>
            {breakdown.bendDetail && breakdown.bendDetail.bendN > 0 && (
              <SectionFormula label="절곡비" result={breakdown.bendDetail.bendCost}>
                {(() => {
                  const b = breakdown.bendDetail!;
                  return (
                    <>
                      <FormulaRow label="단위시간">
                        lookup({fmtN(value.thkMm ?? 0, 2)} mm) = <b>{fmtN(b.bendSec, 2)} 초/회</b>
                      </FormulaRow>
                      <FormulaRow label="작업시간">
                        셋업/배치 + 횟수 × 사이클/60 = {fmtN(b.setupMin)}/{fmtN(b.batchQty)} + {fmtN(b.bendN)}×{fmtN(b.bendSec, 2)}/60 = <b>{fmtN(b.bendMin, 3)} 분/EA</b>
                      </FormulaRow>
                      <FormulaRow label="임율">
                        벤딩_프레스브레이크 = <b>{fmtN(b.rate)} 원/분</b>
                      </FormulaRow>
                      <FormulaRow label="절곡비">
                        시간 × 임율 = {fmtN(b.bendMin, 3)} × {fmtN(b.rate)} = <b>{fmtN(b.bendCost)} 원/EA</b>
                      </FormulaRow>
                    </>
                  );
                })()}
              </SectionFormula>
            )}
          </fieldset>

          <fieldset>
            <legend>NCT 가공</legend>
            <NctTable
              rows={value.nctRows ?? []}
              onChange={(rows) => onPatch({ nctRows: rows })}
              db={db}
            />
            {breakdown.nctDetail && breakdown.nctDetail.featSec > 0 && (
              <SectionFormula label="NCT 비" result={breakdown.nctDetail.perEa}>
                {(() => {
                  const n = breakdown.nctDetail!;
                  const METHOD_LABEL: Record<typeof n.shapeTotals[number]['method'], string> = {
                    Embossing: '엠보싱',
                    Burring: '버링',
                    Louver: '루버',
                    KnockOut: '녹아웃',
                  };
                  const parts: string[] = [];
                  for (const s of n.shapeTotals) {
                    parts.push(`${METHOD_LABEL[s.method]} ${fmtN(s.count)}×${fmtN(s.sec, 2)}`);
                  }
                  for (const t of n.tapTotals) {
                    parts.push(`탭(${t.size}) ${fmtN(t.count)}×${fmtN(t.sec, 2)}`);
                  }
                  return (
                    <>
                      <FormulaRow label="단위시간 합">
                        {parts.length > 0 ? parts.join(' + ') : '—'} = <b>{fmtN(n.featSec, 2)} 초/EA</b>
                      </FormulaRow>
                      <FormulaRow label="작업시간">
                        셋업/배치 + featSec/60 = {fmtN(n.setupMin)}/{fmtN(n.batchQty)} + {fmtN(n.featSec, 2)}/60 = <b>{fmtN(n.nctMin, 3)} 분/EA</b>
                      </FormulaRow>
                      <FormulaRow label="임율">
                        NCT_펀치프레스 = <b>{fmtN(n.rate)} 원/분</b>
                      </FormulaRow>
                      <FormulaRow label="배치비">
                        (셋업 + featSec×배치/60) × 임율/60 = ({fmtN(n.setupMin)} + {fmtN(n.featSec, 2)}×{fmtN(n.batchQty)}/60) × {fmtN(n.rate)}/60 = <b>{fmtN(n.nctCostBatch)} 원/배치</b>
                      </FormulaRow>
                      <FormulaRow label="NCT 비">
                        배치비 / 배치수량 = {fmtN(n.nctCostBatch)} / {fmtN(n.batchQty)} = <b>{fmtN(n.perEa)} 원/EA</b>
                      </FormulaRow>
                    </>
                  );
                })()}
              </SectionFormula>
            )}
          </fieldset>
        </>
      )}

      <FoldableProcessCard
        title="세척"
        open={value.cleanUse === true}
        onToggle={() => onPatch({ cleanUse: !value.cleanUse })}
      >
        <div className="grid grid-3">
          <label className="field">
            <span className="field-label">조수</span>
            <select
              value={value.cleanN ?? ''}
              onChange={(e) =>
                onPatch({ cleanN: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            >
              <option value="">선택</option>
              {cleanHelpers.map((n) => (
                <option key={n} value={n}>{n}조</option>
              ))}
            </select>
          </label>
        </div>
        {breakdown.cleanDetail && breakdown.cleanDetail.perEa > 0 && (
          <SectionFormula label="세척비" result={breakdown.cleanDetail.perEa}>
            {(() => {
              const c = breakdown.cleanDetail!;
              return (
                <>
                  <FormulaRow label="세척방법">
                    {c.group ?? '재질군 미상'} / {c.helpers}조 → <b>{c.method || '—'}</b>
                  </FormulaRow>
                  <FormulaRow label="단위요율">
                    lookup → <b>{fmtN(c.rate)} 원/kg</b>
                  </FormulaRow>
                  <FormulaRow label="세척비">
                    제품중량 × 요율 = {fmtN(c.netKg, 4)} × {fmtN(c.rate)} = <b>{fmtN(c.perEa)} 원/EA</b>
                  </FormulaRow>
                </>
              );
            })()}
          </SectionFormula>
        )}
      </FoldableProcessCard>

      <FoldableProcessCard
        title="용접"
        open={value.weldRows.length > 0}
        onToggle={() => {
          if (value.weldRows.length > 0) onPatch({ weldRows: [] });
          else onPatch({ weldRows: [{ kind: 'TIG', posFactor: 1 }] });
        }}
      >
        <WeldRowsTable
          rows={value.weldRows}
          onChange={(next) => onPatch({ weldRows: next })}
        />
        <WeldRowsPreview details={breakdown.weldDetails} thkMm={value.thkMm ?? 0} />
        {breakdown.weldDetails && breakdown.weldDetails.length > 0 && (
          <SectionFormula label="용접비 합계" result={breakdown.weldCost ?? 0}>
            <FormulaRow label="합계식">
              {breakdown.weldDetails.map((d, i) => (
                <span key={i}>{i > 0 ? ' + ' : ''}{fmtN(d.perEa)}</span>
              ))}
              {' = '}
              <b>{fmtN(breakdown.weldCost ?? 0)} 원/EA</b>
            </FormulaRow>
          </SectionFormula>
        )}
      </FoldableProcessCard>

      <FoldableProcessCard
        title="분체 도장"
        open={value.paintUse === true}
        onToggle={() => onPatch({ paintUse: !value.paintUse })}
      >
        <div className="grid grid-3">
          <NumberInput label="도장면적" unit="mm²" value={value.paintAreaMm2} step={1} onChange={(v) => onPatch({ paintAreaMm2: v })} placeholder="예: 100000" />
          <NumberInput label="도막두께" unit="μm" value={value.paintThkUm} step={1} onChange={(v) => onPatch({ paintThkUm: v })} placeholder={`기본 ${db.paint.thkUm}`} />
          <NumberInput label="도료가" unit="원/kg" value={value.paintPricePerKg} step={1} onChange={(v) => onPatch({ paintPricePerKg: v })} placeholder="예: 8000" />
          <NumberInput label="도장시간" unit="분/EA" value={value.paintTimeMin} step={0.1} onChange={(v) => onPatch({ paintTimeMin: v })} placeholder="예: 1" />
        </div>
        {breakdown.paintDetail && breakdown.paintDetail.perEa > 0 && (
          <SectionFormula label="도장비" result={breakdown.paintDetail.perEa}>
            {(() => {
              const p = breakdown.paintDetail!;
              return (
                <>
                  <FormulaRow label="도료량">
                    면적/1M × 두께(μm) × 비중 / 효율 = {fmtN(p.areaMm2)}/1,000,000 × {fmtN(p.thkUm)} × {fmtN(p.densityGcm3, 2)} / {fmtN(p.efficiency, 2)} = <b>{fmtN(p.paintGEa, 2)} g/EA</b>
                  </FormulaRow>
                  <FormulaRow label="재료비">
                    도료량 × 단가 / 1000 = {fmtN(p.paintGEa, 2)} × {fmtN(p.pricePerKg)} / 1000 = <b>{fmtN(p.paintMatEa)} 원/EA</b>
                  </FormulaRow>
                  <FormulaRow label="인건비">
                    시간 × (부스 {fmtN(p.boothRate)} + 소결 {fmtN(p.furnaceRate)}) / 60 = {fmtN(p.timeMin, 2)} × {fmtN(p.boothRate + p.furnaceRate)} / 60 = <b>{fmtN(p.paintLaborEa)} 원/EA</b>
                  </FormulaRow>
                  <FormulaRow label="도장비">
                    재료비 + 인건비 = {fmtN(p.paintMatEa)} + {fmtN(p.paintLaborEa)} = <b>{fmtN(p.perEa)} 원/EA</b>
                  </FormulaRow>
                </>
              );
            })()}
          </SectionFormula>
        )}
      </FoldableProcessCard>

      <fieldset>
        <legend>운반</legend>
        <div className="grid grid-3">
          <label className="field">
            <span className="field-label">방식</span>
            <select
              value={value.transMethod ?? ''}
              onChange={(e) => onPatch({ transMethod: e.target.value as TransportMethod })}
            >
              <option value="">미적용</option>
              <option value="용달">용달</option>
              <option value="자체">자체</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">차량톤수</span>
            <select
              value={value.transTon ?? ''}
              onChange={(e) => onPatch({ transTon: e.target.value || undefined })}
            >
              <option value="">선택</option>
              {(value.transMethod === '자체' ? ownTons : freightTons).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <NumberInput label="편도거리" unit="km" value={value.transKm} step={1} onChange={(v) => onPatch({ transKm: v })} placeholder="예: 80" />
          <label className="field">
            <span className="field-label">왕복</span>
            <select
              value={value.transRound !== false ? 'Y' : 'N'}
              onChange={(e) => onPatch({ transRound: e.target.value === 'Y' })}
            >
              <option value="Y">Y</option>
              <option value="N">N</option>
            </select>
          </label>
        </div>
        <TransportLoadInputs value={value} onPatch={onPatch} />
        <TransportPreview value={value} db={db} />
        {breakdown.transportDetail && breakdown.transportDetail.loadSource !== 'none' && (breakdown.transportCost ?? 0) > 0 && (
          <SectionFormula label="운반비" result={breakdown.transportCost ?? 0}>
            {(() => {
              const t = breakdown.transportDetail!;
              const batch = value.batchQty ?? 0;
              return (
                <>
                  <FormulaRow label="회당 적재">
                    {t.loadSource === 'hierarchy' && t.eaPerBox && t.boxPerPallet && t.palletPerCar ? (
                      t.clipped && t.userLoadEa != null && t.capacityEa != null ? (
                        <>
                          min({fmtN(t.eaPerBox)} × {fmtN(t.boxPerPallet)} × {fmtN(t.palletPerCar)}, {fmtN(t.capacityEa)}) = <b>{fmtN(t.effectiveLoad)} EA/회</b> (선행 한계 적용)
                        </>
                      ) : (
                        <>{fmtN(t.eaPerBox)} × {fmtN(t.boxPerPallet)} × {fmtN(t.palletPerCar)} = <b>{fmtN(t.effectiveLoad)} EA/회</b></>
                      )
                    ) : (
                      <><b>{fmtN(t.effectiveLoad)} EA/회</b> (직접 입력)</>
                    )}
                  </FormulaRow>
                  <FormulaRow label="회당 운반비">
                    {value.transRound !== false ? '왕복 반영 ' : ''}<b>{fmtN(t.perTrip)} 원</b>
                  </FormulaRow>
                  <FormulaRow label="필요 회차">
                    ⌈{fmtN(batch)} / {fmtN(t.effectiveLoad)}⌉ = <b>{fmtN(t.trips)} 회</b>
                  </FormulaRow>
                  <FormulaRow label="총 운반비">
                    회당 × 횟수 = {fmtN(t.perTrip)} × {fmtN(t.trips)} = <b>{fmtN(t.total)} 원</b>
                  </FormulaRow>
                  <FormulaRow label="운반비/EA">
                    총 / 배치수량 = {fmtN(t.total)} / {fmtN(batch)} = <b>{fmtN(t.perEa)} 원/EA</b>
                  </FormulaRow>
                  {(t.overWeight || t.overVolume) && (
                    <FormulaRow label="⚠">
                      {t.overWeight && '회당 무게 초과 '}
                      {t.overVolume && '회당 부피 초과'} — 차량 톤수 재검토 필요
                    </FormulaRow>
                  )}
                </>
              );
            })()}
          </SectionFormula>
        )}
      </fieldset>

      <fieldset>
        <legend>후공정 추가비용</legend>
        <PostCostTable
          rows={value.postCostRows}
          onChange={(next) => onPatch({ postCostRows: next })}
        />
        <PostCostPreview rows={value.postCostRows} />
      </fieldset>

      <fieldset>
        <legend>일반관리비·이윤</legend>
        <div className="grid grid-3">
          <PercentInput
            label="일반관리비율"
            value={value.overheadRateOverride}
            onChange={(v) => onPatch({ overheadRateOverride: v })}
            placeholder={`기본 ${(db.assumptions.overheadRate * 100).toFixed(1)}`}
          />
          <PercentInput
            label="이윤율"
            value={value.marginRateOverride}
            onChange={(v) => onPatch({ marginRateOverride: v })}
            placeholder={`기본 ${(db.assumptions.marginRate * 100).toFixed(1)}`}
          />
        </div>
        {breakdown.marginDetail && (
          <SectionFormula label="원가/이윤" result={breakdown.marginDetail.shouldCost} resultLabel="Should-Cost">
            {(() => {
              const md = breakdown.marginDetail!;
              return (
                <>
                  <FormulaRow label="직접비">
                    재료 + 가공 + 운반 + 후공정 = {fmtN(md.materialCost)} + {fmtN(md.processCost)} + {fmtN(md.transportCost)} + {fmtN(md.postCost)} = <b>{fmtN(md.direct)} 원/EA</b>
                  </FormulaRow>
                  <FormulaRow label="일반관리비">
                    (가공 + 운반 + 후공정) × {fmtN(md.overheadRate * 100, 1)}% = {fmtN(md.overheadBase)} × {fmtN(md.overheadRate, 4)} = <b>{fmtN(md.overheadCost)} 원/EA</b>
                  </FormulaRow>
                  <FormulaRow label="이윤">
                    (가공 + 운반 + 후공정 + 관리비) × {fmtN(md.marginRate * 100, 1)}% = {fmtN(md.overheadBase + md.overheadCost)} × {fmtN(md.marginRate, 4)} = <b>{fmtN(md.profitCost)} 원/EA</b>
                  </FormulaRow>
                  <FormulaRow label="합계">
                    직접 + 관리 + 이윤 = <b>{fmtN(md.rawSum)} 원/EA</b>
                  </FormulaRow>
                </>
              );
            })()}
          </SectionFormula>
        )}
      </fieldset>
    </section>
  );
}
