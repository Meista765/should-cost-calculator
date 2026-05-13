import type { Db, NctMethod, NctRow } from '../types/domain';

type Props = {
  rows: NctRow[];
  onChange: (next: NctRow[]) => void;
  db: Db;
};

const METHOD_OPTIONS: { value: NctMethod; label: string }[] = [
  { value: 'Embossing', label: '엠보싱' },
  { value: 'Burring', label: '버링' },
  { value: 'Louver', label: '루버' },
  { value: 'KnockOut', label: '녹아웃' },
  { value: 'Tap', label: '탭' },
];

function parseFiniteNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const next = Number(raw);
  return Number.isFinite(next) ? next : undefined;
}

export function NctTable({ rows, onChange, db }: Props) {
  const tapSizes = db.nctFeat.tap.map((t) => t.size);
  const defaultTapSize = tapSizes[0];

  const update = (i: number, patch: Partial<NctRow>) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const remove = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i));
  };

  const insertEmpty = (i: number) => {
    const next = rows.slice();
    next.splice(i + 1, 0, { method: 'Embossing' });
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

  const add = () => {
    onChange([...rows, { method: 'Embossing' }]);
  };

  return (
    <div className="processes">
      <div className="table-scroll">
        <table className="process-table">
          <caption className="sr-only">NCT 가공도 행 입력 표</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">방법</th>
              <th scope="col">사양</th>
              <th scope="col">갯수</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: 'center' }}>
                  행이 없습니다. 아래 [+ 맨 아래에 행 추가] 버튼으로 가공도 행을 추가하세요.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const isTap = r.method === 'Tap';
              return (
                <tr key={i}>
                  <td className="num process-index" data-label="#">{`#${i + 1}`}</td>
                  <td data-label="방법">
                    <select
                      value={r.method}
                      aria-label={`NCT ${i + 1} 방법`}
                      onChange={(e) => {
                        const method = e.target.value as NctMethod;
                        if (method === 'Tap') {
                          update(i, {
                            method,
                            tapSize: r.tapSize ?? defaultTapSize,
                          });
                        } else {
                          const { tapSize: _drop, ...rest } = r;
                          onChange(
                            rows.map((row, idx) =>
                              idx === i ? { ...rest, method } : row,
                            ),
                          );
                        }
                      }}
                    >
                      {METHOD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="사양">
                    {isTap ? (
                      <select
                        value={r.tapSize ?? ''}
                        aria-label={`NCT ${i + 1} 탭 사이즈`}
                        disabled={tapSizes.length === 0}
                        onChange={(e) => update(i, { tapSize: e.target.value })}
                      >
                        {tapSizes.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td data-label="갯수">
                    <input
                      type="number"
                      step={1}
                      min={0}
                      inputMode="decimal"
                      placeholder="개수"
                      aria-label={`NCT ${i + 1} 갯수`}
                      value={r.count ?? ''}
                      onChange={(e) =>
                        update(i, { count: parseFiniteNumber(e.target.value) })
                      }
                    />
                  </td>
                  <td data-label="관리">
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        className="admin-row-btn"
                        title="이 행 아래에 빈 행 삽입"
                        onClick={() => insertEmpty(i)}
                        aria-label={`NCT ${i + 1} 빈 행 삽입`}
                      >
                        ＋
                      </button>
                      <button
                        type="button"
                        className="admin-row-btn"
                        title="이 행 아래에 복제 삽입"
                        onClick={() => dup(i)}
                        aria-label={`NCT ${i + 1} 복제`}
                      >
                        ⎘
                      </button>
                      <button
                        type="button"
                        className="admin-row-btn"
                        title="위로"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label={`NCT ${i + 1} 위로`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="admin-row-btn"
                        title="아래로"
                        onClick={() => move(i, 1)}
                        disabled={i === rows.length - 1}
                        aria-label={`NCT ${i + 1} 아래로`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="admin-row-btn admin-row-del"
                        title="삭제"
                        onClick={() => remove(i)}
                        aria-label={`NCT ${i + 1} 행 삭제`}
                      >
                        −
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="admin-add-row" onClick={add}>
        <span className="admin-add-row-icon" aria-hidden>+</span>
        <span>맨 아래에 행 추가</span>
      </button>
    </div>
  );
}
