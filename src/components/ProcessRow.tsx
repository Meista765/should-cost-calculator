import type { PressKind, ProcessInput } from '../types/domain';
import type { Db } from '../types/domain';

type Props = {
  index: number;
  value: ProcessInput;
  onChange: (patch: Partial<ProcessInput>) => void;
  db: Db;
};

function parseFiniteNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const next = Number(raw);
  return Number.isFinite(next) ? next : undefined;
}

export function ProcessRow({ index, value, onChange, db }: Props) {
  const tonnages = [...new Set(db.press.filter((p) => p.kind === value.kind).map((p) => p.tonnage))]
    .sort((a, b) => a - b);
  const roles = db.worker.map((w) => w.role);

  return (
    <tr>
      <td className="num process-index" data-label="공정">{`#${index + 1}`}</td>
      <td data-label="구분">
        <select
          value={value.kind}
          onChange={(e) => {
            const kind = e.target.value as PressKind;
            const firstTonnage = db.press.find((p) => p.kind === kind)?.tonnage;
            onChange({ kind, ...(firstTonnage == null ? {} : { tonnage: firstTonnage }) });
          }}
        >
          <option value="프로">프로</option>
          <option value="단발">단발</option>
        </select>
      </td>
      <td data-label="톤수">
        <select
          value={value.tonnage}
          onChange={(e) => {
            const tonnage = parseFiniteNumber(e.target.value);
            if (tonnage != null) onChange({ tonnage });
          }}
        >
          {tonnages.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td data-label="UPH (EA/hr)">
        <input
          type="number"
          min={1}
          value={value.uph ?? ''}
          onChange={(e) => onChange({ uph: parseFiniteNumber(e.target.value) })}
        />
      </td>
      <td data-label="직종">
        <select
          value={value.workerRole}
          onChange={(e) => onChange({ workerRole: e.target.value })}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}
