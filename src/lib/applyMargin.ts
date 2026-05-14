// 공통 후처리: direct cost → overhead/profit/should-cost.
// press·sheet 모드 모두 사용.
// 일반관리비·이윤은 재료비를 제외한 overheadBase(가공·운반·후공정)에만 적용한다.
import type { Assumptions } from '../types/domain';

export type ApplyMarginInput = {
  direct: number;       // 재료 포함 직접비 합계 (shouldCost 합산용)
  overheadBase: number; // 관리비/이윤 산정 기준 (재료비 제외 = 가공 + 운반 + 후공정)
  assumptions: Assumptions;
  overrides?: { overheadRate?: number; marginRate?: number };
};

export type ApplyMarginOutput = {
  overheadBase: number;
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
  overheadBase,
  assumptions,
  overrides,
}: ApplyMarginInput): ApplyMarginOutput {
  const overheadRate = clamp01(overrides?.overheadRate ?? assumptions.overheadRate);
  const marginRate = clamp01(overrides?.marginRate ?? assumptions.marginRate);
  const overheadCost = overheadBase * overheadRate;
  const profitCost = (overheadBase + overheadCost) * marginRate;
  const shouldCost = direct + overheadCost + profitCost;

  return {
    overheadBase,
    overheadCost,
    profitCost,
    shouldCost,
    appliedOverheadRate: overheadRate,
    appliedMarginRate: marginRate,
  };
}
