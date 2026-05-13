import type { PostCostRow } from '../types/domain';

type Props = { rows: PostCostRow[] };

const fmtInt = (n: number) =>
  Math.round(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR');

export function PostCostPreview({ rows }: Props) {
  if (rows.length === 0) return null;
  const total = rows.reduce(
    (s, r) => s + (Number.isFinite(r.costEa) ? r.costEa : 0),
    0,
  );
  return (
    <div className="post-preview" aria-label="후공정 추가비 미리보기">
      <div className="post-preview-chain">
        {rows.map((r, i) => (
          <span key={i} className="post-chip">
            <em>{r.label || `행 ${i + 1}`}</em>
            <strong>{fmtInt(r.costEa)}</strong>
            <span>원/EA</span>
          </span>
        ))}
        <span className="post-chip-op">=</span>
        <span className="post-chip post-chip-total">
          <em>소계</em>
          <strong>{fmtInt(total)}</strong>
          <span>원/EA</span>
        </span>
      </div>
      <div className="post-preview-meta">총 {rows.length}개 항목</div>
    </div>
  );
}
