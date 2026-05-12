import type {
  Db,
  ProcessInput,
  ProcessMethod,
  TapSize,
  TransportMethod,
  UnifiedFormSlice,
  WeldKind,
} from '../types/domain';
import { listAllMaterials } from '../lib/lookup';
import { ProcessRowList } from './ProcessRowList';

type Props = {
  title: string;
  value: UnifiedFormSlice;
  onPatch: (patch: Partial<UnifiedFormSlice>) => void;
  onSetMethod: (method: ProcessMethod) => void;
  onSetProcessCount: (n: number) => void;
  onPatchProcess: (index: number, patch: Partial<ProcessInput>) => void;
  db: Db;
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
}) {
  const { label, unit, value, onChange, step = 0.1, min = 0, placeholder, hint, ariaLabel } = props;
  const hasRangeError = value != null && value < min;
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
        className={hasRangeError ? 'input-invalid' : undefined}
        aria-invalid={hasRangeError}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
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
}: Props) {
  const materials = listAllMaterials(db);
  const freightTons = db.freightMatrix.map((r) => r.tonnage);
  const ownTons = db.ownVehicleMatrix.map((r) => r.tonnage);
  const cleanHelpers = db.cleanMatrix.map((r) => r.helpers);

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
        <legend>재질·치수 (원소재)</legend>
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
                  {m.displayName} (비중 {m.density})
                </option>
              ))}
            </select>
          </label>
          <NumberInput label="두께" unit="mm" value={value.thkMm} step={0.1} onChange={(v) => onPatch({ thkMm: v })} placeholder="예: 2.0" />
          <NumberInput label="가로 X" unit="mm" value={value.xMm} step={1} onChange={(v) => onPatch({ xMm: v })} placeholder="예: 200" hint="프레스: 코일 폭" />
          <NumberInput label="세로 Y" unit="mm" value={value.yMm} step={1} onChange={(v) => onPatch({ yMm: v })} placeholder="예: 150" hint="프레스: 피치" />
          <NumberInput label="배치 수량" unit="EA" value={value.batchQty} step={1} onChange={(v) => onPatch({ batchQty: v })} placeholder="예: 100" />
          <NumberInput label="재료 단가" unit="원/kg" value={value.matPrice} step={1} onChange={(v) => onPatch({ matPrice: v })} placeholder="비우면 코일 DB 자동 조회" />
          <NumberInput label="스크랩 단가" unit="원/kg" value={value.scrapPrice} step={1} onChange={(v) => onPatch({ scrapPrice: v })} placeholder="비우면 코일 DB 자동 조회" />
          <PercentInput
            label="스크랩 회수율"
            value={value.scrapRecovery}
            onChange={(v) => onPatch({ scrapRecovery: v })}
            placeholder="기본 100"
            hint="(원소재-제품) × 회수율 만큼 스크랩으로 환입"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>제품</legend>
        <div className="grid grid-3">
          <NumberInput label="체적" unit="mm³" value={value.volMm3} step={1} onChange={(v) => onPatch({ volMm3: v })} placeholder="예: 50000" hint="순중량 계산용" />
          <NumberInput label="너비" unit="mm" value={value.partWidth} onChange={(v) => onPatch({ partWidth: v })} placeholder="선택" hint="참고용" />
          <NumberInput label="길이" unit="mm" value={value.partLength} onChange={(v) => onPatch({ partLength: v })} placeholder="선택" hint="참고용" />
          <NumberInput label="높이" unit="mm" value={value.partHeight} onChange={(v) => onPatch({ partHeight: v })} placeholder="선택" hint="참고용" />
          <NumberInput label="표면적" unit="mm²" value={value.surfaceArea} step={1} onChange={(v) => onPatch({ surfaceArea: v })} placeholder="선택" hint="참고용" />
        </div>
      </fieldset>

      {value.processMethod === 'press' ? (
        <fieldset>
          <legend>설비/공정 (프레스)</legend>
          <ProcessRowList
            count={value.pressProcessCount}
            rows={value.pressProcesses}
            onSetCount={onSetProcessCount}
            onPatchRow={onPatchProcess}
            db={db}
          />
        </fieldset>
      ) : (
        <>
          <fieldset>
            <legend>레이저 절단</legend>
            <div className="grid grid-3">
              <NumberInput label="외곽 둘레" unit="mm" value={value.perimeterMm} step={1} onChange={(v) => onPatch({ perimeterMm: v })} placeholder="예: 900" />
              <NumberInput label="피어싱 수" unit="회" value={value.pierceN} step={1} onChange={(v) => onPatch({ pierceN: v })} placeholder="예: 6" />
            </div>
          </fieldset>

          <fieldset>
            <legend>절곡</legend>
            <div className="grid grid-3">
              <NumberInput label="bend 수" unit="회" value={value.bendN} step={1} onChange={(v) => onPatch({ bendN: v })} placeholder="예: 2" />
            </div>
          </fieldset>

          <fieldset>
            <legend>NCT 가공</legend>
            <div className="grid grid-3">
              <NumberInput label="엠보싱" unit="개" value={value.nctEm} step={1} onChange={(v) => onPatch({ nctEm: v })} />
              <NumberInput label="버링" unit="개" value={value.nctBur} step={1} onChange={(v) => onPatch({ nctBur: v })} />
              <NumberInput label="탭" unit="개" value={value.nctTap} step={1} onChange={(v) => onPatch({ nctTap: v })} />
              <NumberInput label="루버" unit="개" value={value.nctLou} step={1} onChange={(v) => onPatch({ nctLou: v })} />
              <label className="field">
                <span className="field-label">탭 사이즈</span>
                <select
                  value={value.nctTapSize ?? 'M5'}
                  onChange={(e) => onPatch({ nctTapSize: e.target.value as TapSize })}
                >
                  {(['M3', 'M4', 'M5', 'M6', 'M8'] as TapSize[]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        </>
      )}

      <fieldset>
        <legend>세척</legend>
        <div className="grid grid-3">
          <label className="field">
            <span className="field-label">세척 적용</span>
            <select
              value={value.cleanUse ? 'Y' : 'N'}
              onChange={(e) => onPatch({ cleanUse: e.target.value === 'Y' })}
            >
              <option value="N">N</option>
              <option value="Y">Y</option>
            </select>
          </label>
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
      </fieldset>

      <fieldset>
        <legend>용접</legend>
        <div className="grid grid-3">
          <label className="field">
            <span className="field-label">용접 종류</span>
            <select
              value={value.weldKind ?? ''}
              onChange={(e) => onPatch({ weldKind: (e.target.value as WeldKind) || '' })}
            >
              <option value="">없음</option>
              {(['TIG', 'MIG', 'MAG', 'CO2', 'Robot', 'Spot'] as WeldKind[]).map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
          <NumberInput label="용접 길이" unit="mm" value={value.weldLenMm} step={1} onChange={(v) => onPatch({ weldLenMm: v })} />
          <NumberInput label="점용접 점수" unit="점" value={value.weldSpots} step={1} onChange={(v) => onPatch({ weldSpots: v })} />
          <NumberInput label="자세계수" value={value.weldPosFactor} step={0.1} onChange={(v) => onPatch({ weldPosFactor: v })} placeholder="1.0" hint="아래/수평/수직 등 보정" />
        </div>
      </fieldset>

      <fieldset>
        <legend>분체 도장</legend>
        <div className="grid grid-3">
          <label className="field">
            <span className="field-label">도장 적용</span>
            <select
              value={value.paintUse ? 'Y' : 'N'}
              onChange={(e) => onPatch({ paintUse: e.target.value === 'Y' })}
            >
              <option value="N">N</option>
              <option value="Y">Y</option>
            </select>
          </label>
          <NumberInput label="도장면적" unit="mm²" value={value.paintAreaMm2} step={1} onChange={(v) => onPatch({ paintAreaMm2: v })} placeholder="예: 100000" />
          <NumberInput label="도막두께" unit="μm" value={value.paintThkUm} step={1} onChange={(v) => onPatch({ paintThkUm: v })} placeholder={`기본 ${db.paint.thkUm}`} />
          <NumberInput label="도료가" unit="원/kg" value={value.paintPricePerKg} step={1} onChange={(v) => onPatch({ paintPricePerKg: v })} placeholder="예: 8000" />
          <NumberInput label="도장시간" unit="분/EA" value={value.paintTimeMin} step={0.1} onChange={(v) => onPatch({ paintTimeMin: v })} placeholder="예: 1" />
        </div>
      </fieldset>

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
          <NumberInput label="회당 적재" unit="EA/회" value={value.transLoad} step={1} onChange={(v) => onPatch({ transLoad: v })} placeholder="예: 100" />
          <PercentInput label="야간 할증" value={value.transNight} onChange={(v) => onPatch({ transNight: v })} placeholder="0~30" />
        </div>
      </fieldset>

      <fieldset>
        <legend>일반관리비·이윤</legend>
        <div className="grid grid-3">
          <PercentInput
            label="일반관리비율"
            value={value.overheadRateOverride}
            onChange={(v) => onPatch({ overheadRateOverride: v })}
            placeholder={`기본 ${(db.assumptions.overheadRate * 100).toFixed(1)}`}
            hint="미입력 시 기본값 사용"
          />
          <PercentInput
            label="이윤율"
            value={value.marginRateOverride}
            onChange={(v) => onPatch({ marginRateOverride: v })}
            placeholder={`기본 ${(db.assumptions.marginRate * 100).toFixed(1)}`}
            hint="미입력 시 기본값 사용"
          />
          <NumberInput label="후공정 추가비용" unit="원/EA" value={value.postCostEa} step={1} onChange={(v) => onPatch({ postCostEa: v })} hint="기타 후공정 일괄" />
        </div>
      </fieldset>

      <fieldset>
        <legend>견적 비교 (선택)</legend>
        <div className="grid grid-3">
          <NumberInput label="견적 단가" unit="원/EA" value={value.quotePerEa} step={1} onChange={(v) => onPatch({ quotePerEa: v })} placeholder="협력사 견적" hint="입력 시 적정/협상/주의 판정" />
        </div>
      </fieldset>
    </section>
  );
}
