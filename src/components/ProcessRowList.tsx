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
      <div className="table-scroll">
        <table className="process-table">
          <caption className="sr-only">공정별 설비/직종/UPH 입력 표</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">구분</th>
              <th scope="col">톤수</th>
              <th scope="col">UPH (EA/hr)</th>
              <th scope="col">직종</th>
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
    </div>
  );
}
