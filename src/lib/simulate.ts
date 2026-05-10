// CASE 1 시뮬레이션: 동일 강종 두께 변경 / 동일 두께 강종 변경.
import type { CostBreakdown, Db, FormSlice } from '../types/domain';
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
  asIs: FormSlice,
  asIsBreakdown: CostBreakdown,
  db: Db,
): ThicknessVariant[] {
  if (!asIs.grade || asIs.thickness == null || asIs.partVolume == null) return [];
  if (!Number.isFinite(asIs.thickness) || asIs.thickness <= 0 || !Number.isFinite(asIs.partVolume)) {
    return [];
  }
  const t0 = asIs.thickness;
  const v0 = asIs.partVolume;
  const options = thicknessOptionsFor(asIs.grade, db);
  return options
    .map((t) => {
      const scaledVolume = (v0 / t0) * t;
      const variant: FormSlice = { ...asIs, thickness: t, partVolume: scaledVolume };
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
  asIs: FormSlice,
  asIsBreakdown: CostBreakdown,
  db: Db,
): MaterialVariant[] {
  if (!asIs.grade || asIs.thickness == null) return [];
  if (!Number.isFinite(asIs.thickness) || asIs.thickness <= 0) return [];
  const candidates = gradesAvailableForThickness(asIs.thickness, db, 'interpolate');
  return candidates
    .map((c) => {
      const variant: FormSlice = { ...asIs, grade: c.grade };
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
