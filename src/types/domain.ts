export type PressKind = '단발' | '프로';

export type CoilPriceRow = {
  grade: string;
  displayName: string;
  thickness: number;
  coilPrice: number;
  scrapPrice: number;
};

export type MaterialGravityRow = {
  grade: string;
  displayName: string;
  gravity: number;
};

export type PressRateRow = {
  kind: PressKind;
  tonnage: number;
  rate: number;
};

export type WorkerRateRow = {
  role: string;
  rate: number;
};

export type Db = {
  coil: CoilPriceRow[];
  gravity: MaterialGravityRow[];
  press: PressRateRow[];
  worker: WorkerRateRow[];
};

export type ProcessInput = {
  kind: PressKind;
  tonnage: number;
  uph?: number;
  workerRole: string;
};

export type FormSlice = {
  width?: number;
  pitch?: number;
  thickness?: number;
  scrapRecovery?: number;
  partVolume?: number;
  partWidth?: number;
  partLength?: number;
  partHeight?: number;
  surfaceArea?: number;
  grade?: string;
  processCount: number;
  processes: ProcessInput[];
};

export type CostBreakdown = {
  rawWeightKg: number;
  partWeightKg: number;
  scrapWeightKg: number;
  materialCost: number;
  processCost: number;
  totalCost: number;
  warnings: string[];
  errors: string[];   // 사용자 입력 오류 (예: 원소재 중량 < 제품 중량)
  unavailable?: { reason: 'no-grade' | 'out-of-range' | 'missing-input'; message: string };
};

export type LookupMethod = 'exact' | 'interpolate' | 'unavailable';
