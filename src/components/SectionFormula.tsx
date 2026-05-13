import type { ReactNode } from 'react';

type Tone = 'normal' | 'muted';

type Props = {
  label: string;
  children?: ReactNode;
  result?: number;
  resultLabel?: string;
  unit?: string;
  tone?: Tone;
  emptyMessage?: string;
};

export function SectionFormula({
  label,
  children,
  result,
  resultLabel = '결과',
  unit = '원/EA',
  tone = 'normal',
  emptyMessage,
}: Props) {
  if (emptyMessage) {
    return (
      <div className={`section-formula muted`} aria-label={`${label} 계산식`}>
        <div className="sf-head">{label} 계산식</div>
        <div className="sf-empty">{emptyMessage}</div>
      </div>
    );
  }
  return (
    <div
      className={`section-formula${tone === 'muted' ? ' muted' : ''}`}
      aria-label={`${label} 계산식`}
    >
      <div className="sf-head">{label} 계산식</div>
      <div className="sf-body">{children}</div>
      {result != null && (
        <div className="section-formula-total">
          <span className="sf-total-lbl">{resultLabel}</span>
          <span className="sf-total-val">
            <b>{fmtKRW(result)}</b> {unit}
          </span>
        </div>
      )}
    </div>
  );
}

export function FormulaRow({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="section-formula-row">
      <span className="lbl">{label ?? ''}</span>
      <span className="val">{children}</span>
    </div>
  );
}

// ----- 표시용 헬퍼 -----
const intFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const krwFmt = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

export function fmtN(v: number | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (digits === 0) return intFmt.format(Math.round(v));
  return v.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

export function fmtKRW(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return krwFmt.format(Math.round(v));
}
