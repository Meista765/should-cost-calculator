// 공통 후처리: direct cost → overhead/profit/should-cost.
// press·sheet 모드 모두 사용.
import type { Assumptions } from '../types/domain';

export type ApplyMarginInput = {
  direct: number;
  assumptions: Assumptions;
  overrides?: { overheadRate?: number; marginRate?: number };
};

export type ApplyMarginOutput = {
  overheadCost: number;
  profitCost: number;
  shouldCost: number;
  appliedOverheadRate: number;
  appliedMarginRate: number;
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function applyMarginOverhead({
  direct,
  assumptions,
  overrides,
}: ApplyMarginInput): ApplyMarginOutput {
  const overheadRate = clamp01(overrides?.overheadRate ?? assumptions.overheadRate);
  const marginRate = clamp01(overrides?.marginRate ?? assumptions.marginRate);
  const overheadCost = direct * overheadRate;
  const profitCost = (direct + overheadCost) * marginRate;
  const raw = direct + overheadCost + profitCost;
  const shouldCost = raw;

  return {
    overheadCost,
    profitCost,
    shouldCost,
    appliedOverheadRate: overheadRate,
    appliedMarginRate: marginRate,
  };
}
