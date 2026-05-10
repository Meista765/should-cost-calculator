import type { Db, ProcessInput } from '../types/domain';
import { ProcessRow } from './ProcessRow';

type Props = {
  count: number;
  rows: ProcessInput[];
  onSetCount: (n: number) => void;
  onPatchRow: (index: number, patch: Partial<ProcessInput>) => void;
  db: Db;
};

export function ProcessRowList({ count, rows, onSetCount, onPatchRow, db }: Props) {
  return (
    <div className="processes">
      <div className="row-inline">
        <label>총 공정 수</label>
        <select value={count} onChange={(e) => onSetCount(Number(e.target.value))}>
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <table className="process-table">
        <thead>
          <tr>
            <th>#</th>
            <th>구분</th>
            <th>톤수</th>
            <th>UPH (EA/hr)</th>
            <th>직종</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <ProcessRow
              key={i}
              index={i}
              value={r}
              onChange={(patch) => onPatchRow(i, patch)}
              db={db}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
