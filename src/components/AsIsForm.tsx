import type { Db, FormSlice, ProcessInput } from '../types/domain';
import { listAllGrades, lookupGravity } from '../lib/lookup';
import { ProcessRowList } from './ProcessRowList';

type Props = {
  title: string;
  value: FormSlice;
  onPatch: (patch: Partial<FormSlice>) => void;
  onSetProcessCount: (n: number) => void;
  onPatchProcess: (index: number, patch: Partial<ProcessInput>) => void;
  db: Db;
};

function parseFiniteNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const next = Number(raw);
  return Number.isFinite(next) ? next : undefined;
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
}) {
  const { label, unit, value, onChange, step = 0.1, min = 0, placeholder, hint } = props;
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
        className={hasRangeError ? 'input-invalid' : undefined}
        aria-invalid={hasRangeError}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function AsIsForm({ title, value, onPatch, onSetProcessCount, onPatchProcess, db }: Props) {
  const grades = listAllGrades(db).map((g) => ({
    ...g,
    gravity: lookupGravity(g.grade, db)?.gravity,
  }));
  return (
    <section className="form-card">
      <h2>{title}</h2>

      <fieldset>
        <legend>원소재</legend>
        <div className="grid grid-3">
          <label className="field">
            <span className="field-label">강종</span>
            <select
              value={value.grade ?? ''}
              onChange={(e) => onPatch({ grade: e.target.value || undefined })}
              aria-label={`${title} 강종`}
            >
              <option value="">강종 선택</option>
              {grades.map((g) => (
                <option key={g.grade} value={g.grade}>
                  {g.displayName}
                  {g.gravity != null ? ` (비중 ${g.gravity})` : ''}
                </option>
              ))}
            </select>
          </label>
          <NumberInput
            label="코일 폭"
            unit="mm"
            value={value.width}
            onChange={(v) => onPatch({ width: v })}
            placeholder="예: 120"
          />
          <NumberInput
            label="피치"
            unit="mm"
            value={value.pitch}
            onChange={(v) => onPatch({ pitch: v })}
            placeholder="예: 80"
          />
          <NumberInput
            label="두께"
            unit="mm"
            value={value.thickness}
            step={0.05}
            onChange={(v) => onPatch({ thickness: v })}
            placeholder="예: 1.2"
          />
          <label className="field">
            <span className="field-label">
              스크랩 회수율<em className="unit">(%)</em>
            </span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={value.scrapRecovery == null ? '' : value.scrapRecovery * 100}
              onChange={(e) => {
                const next = parseFiniteNumber(e.target.value);
                onPatch({
                  scrapRecovery:
                    next == null ? undefined : Math.min(1, Math.max(0, next / 100)),
                });
              }}
              placeholder="예: 90"
              inputMode="decimal"
              aria-label={`${title} 스크랩 회수율`}
            />
            <span className="field-hint">0~100 범위로 입력</span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>제품</legend>
        <div className="grid grid-3">
          <NumberInput
            label="너비"
            unit="mm"
            value={value.partWidth}
            onChange={(v) => onPatch({ partWidth: v })}
            placeholder="선택 입력"
            hint="참고용"
          />
          <NumberInput
            label="길이"
            unit="mm"
            value={value.partLength}
            onChange={(v) => onPatch({ partLength: v })}
            placeholder="선택 입력"
            hint="참고용"
          />
          <NumberInput
            label="높이"
            unit="mm"
            value={value.partHeight}
            onChange={(v) => onPatch({ partHeight: v })}
            placeholder="선택 입력"
            hint="참고용"
          />
          <NumberInput
            label="표면적"
            unit="mm²"
            value={value.surfaceArea}
            step={1}
            onChange={(v) => onPatch({ surfaceArea: v })}
            placeholder="선택 입력"
            hint="참고용"
          />
          <NumberInput
            label="체적"
            unit="mm³"
            value={value.partVolume}
            step={1}
            onChange={(v) => onPatch({ partVolume: v })}
            placeholder="예: 15000"
          />
        </div>
      </fieldset>

      <fieldset>
        <legend>설비/공정</legend>
        <ProcessRowList
          count={value.processCount}
          rows={value.processes}
          onSetCount={onSetProcessCount}
          onPatchRow={onPatchProcess}
          db={db}
        />
      </fieldset>
    </section>
  );
}
