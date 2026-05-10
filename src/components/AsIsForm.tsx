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
}) {
  const { label, unit, value, onChange, step = 0.1, min = 0 } = props;
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
      />
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
            >
              <option value="">선택…</option>
              {grades.map((g) => (
                <option key={g.grade} value={g.grade}>
                  {g.displayName}
                  {g.gravity != null ? ` (비중 ${g.gravity})` : ''}
                </option>
              ))}
            </select>
          </label>
          <NumberInput
            label="폭"
            unit="mm"
            value={value.width}
            onChange={(v) => onPatch({ width: v })}
          />
          <NumberInput
            label="피치"
            unit="mm"
            value={value.pitch}
            onChange={(v) => onPatch({ pitch: v })}
          />
          <NumberInput
            label="두께"
            unit="mm"
            value={value.thickness}
            step={0.05}
            onChange={(v) => onPatch({ thickness: v })}
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
            />
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
          />
          <NumberInput
            label="길이"
            unit="mm"
            value={value.partLength}
            onChange={(v) => onPatch({ partLength: v })}
          />
          <NumberInput
            label="높이"
            unit="mm"
            value={value.partHeight}
            onChange={(v) => onPatch({ partHeight: v })}
          />
          <NumberInput
            label="표면적"
            unit="mm²"
            value={value.surfaceArea}
            step={1}
            onChange={(v) => onPatch({ surfaceArea: v })}
          />
          <NumberInput
            label="체적"
            unit="mm³"
            value={value.partVolume}
            step={1}
            onChange={(v) => onPatch({ partVolume: v })}
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
