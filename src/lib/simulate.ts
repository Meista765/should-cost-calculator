// CASE 1 시뮬레이션: 동일 강종 두께 변경 / 동일 두께 강종 변경.
import type { CostBreakdown, Db, UnifiedFormSlice } from '../types/domain';
import { computeBreakdown } from './calc';
import { gradesAvailableForThickness, thicknessOptionsFor } from './lookup';

export type ThicknessVariant = {
  thickness: number;
  estimatedVolume: number;   // V0 / t0 * t (mm³)
  deltaVolumeRatio: number;  // (estimatedVolume - V0) / V0 = (t - t0) / t0
  method: 'exact' | 'interpolate';
  breakdown: CostBreakdown;
  deltaTotal: number;
  deltaMaterial: number;
  deltaProcess: number;
};

export function simulateThicknessChange(
  asIs: UnifiedFormSlice,
  asIsBreakdown: CostBreakdown,
  db: Db,
): ThicknessVariant[] {
  if (!asIs.material || asIs.thkMm == null || asIs.volMm3 == null) return [];
  if (!Number.isFinite(asIs.thkMm) || asIs.thkMm <= 0 || !Number.isFinite(asIs.volMm3)) {
    return [];
  }
  const t0 = asIs.thkMm;
  const v0 = asIs.volMm3;
  const options = thicknessOptionsFor(asIs.material, db);
  return options
    .map((t) => {
      const scaledVolume = (v0 / t0) * t;
      const variant: UnifiedFormSlice = { ...asIs, thkMm: t, volMm3: scaledVolume };
      const breakdown = computeBreakdown(variant, db);
      return {
        thickness: t,
        estimatedVolume: scaledVolume,
        deltaVolumeRatio: (t - t0) / t0,
        method: 'exact' as const,
        breakdown,
        deltaTotal: breakdown.totalCost - asIsBreakdown.totalCost,
        deltaMaterial: breakdown.materialCost - asIsBreakdown.materialCost,
        deltaProcess: breakdown.processCost - asIsBreakdown.processCost,
      };
    })
    .sort((a, b) => a.thickness - b.thickness);
}

export type MaterialVariant = {
  grade: string;
  displayName: string;
  method: 'exact' | 'interpolate';
  breakdown: CostBreakdown;
  deltaTotal: number;
  deltaMaterial: number;
};

export function simulateMaterialChange(
  asIs: UnifiedFormSlice,
  asIsBreakdown: CostBreakdown,
  db: Db,
): MaterialVariant[] {
  if (!asIs.material || asIs.thkMm == null) return [];
  if (!Number.isFinite(asIs.thkMm) || asIs.thkMm <= 0) return [];
  const candidates = gradesAvailableForThickness(asIs.thkMm, db, 'interpolate');
  return candidates
    .map((c) => {
      const variant: UnifiedFormSlice = { ...asIs, material: c.grade };
      const breakdown = computeBreakdown(variant, db);
      return {
        grade: c.grade,
        displayName: c.displayName,
        method: c.method,
        breakdown,
        deltaTotal: breakdown.totalCost - asIsBreakdown.totalCost,
        deltaMaterial: breakdown.materialCost - asIsBreakdown.materialCost,
      };
    })
    .filter((v) => !v.breakdown.unavailable)
    .sort((a, b) => a.breakdown.totalCost - b.breakdown.totalCost);
}
