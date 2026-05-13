import type { PressDetail } from '../types/domain';

type Props = { detail: PressDetail | undefined };

const fmtInt = (n: number) =>
  Math.round(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR');

export function PressPreview({ detail }: Props) {
  if (!detail || detail.rows.length === 0) return null;
  return (
    <div className="post-preview" aria-label="프레스 공정비 미리보기">
      <div className="post-preview-chain">
        {detail.rows.map((r) => (
          <span key={r.index} className="post-chip">
            <em>{`#${r.index + 1}`}</em>
            <strong>{fmtInt(r.perEa)}</strong>
            <span>원/EA</span>
          </span>
        ))}
        <span className="post-chip-op">=</span>
        <span className="post-chip post-chip-total">
          <em>합계</em>
          <strong>{fmtInt(detail.total)}</strong>
          <span>원/EA</span>
        </span>
      </div>
      <div className="post-preview-meta">총 {detail.rows.length}개 공정</div>
    </div>
  );
}
