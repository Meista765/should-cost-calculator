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
        <label htmlFor="process-count">총 공정 수</label>
        <select
          id="process-count"
          value={count}
          onChange={(e) => onSetCount(Number(e.target.value))}
          aria-describedby="process-count-help"
        >
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span id="process-count-help" className="field-hint">
          공정별 UPH와 직종을 입력하면 가공비가 계산됩니다.
        </span>
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
