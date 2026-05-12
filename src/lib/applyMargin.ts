// 공통 후처리: direct cost → overhead/profit/should-cost + verdict 판정.
// press·sheet 모드 모두 사용.
import type { Assumptions, Verdict } from '../types/domain';

export type ApplyMarginInput = {
  direct: number;
  assumptions: Assumptions;
  overrides?: { overheadRate?: number; marginRate?: number };
  quotePerEa?: number;
};

export type ApplyMarginOutput = {
  overheadCost: number;
  profitCost: number;
  shouldCost: number;
  appliedOverheadRate: number;
  appliedMarginRate: number;
  verdict?: Verdict;
  diff?: number;
  diffPct?: number;
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function applyMarginOverhead({
  direct,
  assumptions,
  overrides,
  quotePerEa,
}: ApplyMarginInput): ApplyMarginOutput {
  const overheadRate = clamp01(overrides?.overheadRate ?? assumptions.overheadRate);
  const marginRate = clamp01(overrides?.marginRate ?? assumptions.marginRate);
  const overheadCost = direct * overheadRate;
  const profitCost = (direct + overheadCost) * marginRate;
  const raw = direct + overheadCost + profitCost;
  const shouldCost = Math.max(raw, assumptions.minPartCost);

  let verdict: Verdict | undefined;
  let diff: number | undefined;
  let diffPct: number | undefined;
  if (quotePerEa != null && Number.isFinite(quotePerEa) && shouldCost > 0) {
    diff = quotePerEa - shouldCost;
    diffPct = diff / shouldCost;
    if (diffPct <= 0.15) verdict = '적정';
    else if (diffPct <= 0.30) verdict = '협상';
    else verdict = '주의';
  }

  return {
    overheadCost,
    profitCost,
    shouldCost,
    appliedOverheadRate: overheadRate,
    appliedMarginRate: marginRate,
    verdict,
    diff,
    diffPct,
  };
}
