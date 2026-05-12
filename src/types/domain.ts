export type PressKind = '단발' | '프로';

export type CoilPriceRow = {
  grade: string;
  displayName: string;
  thickness: number;
  coilPrice: number;
  scrapPrice: number;
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

// ----- v10 판금 모델 -----
export const THK_LIST = [
  0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0,
] as const;
export type Thk = (typeof THK_LIST)[number];

export type MaterialGroup = '탄소강' | 'STS' | '비철';
export type CutMaterialKey =
  | 'SS400' | 'SPHC' | 'SPCC' | 'SECC' | 'SGCC'
  | 'SUS304' | 'SUS316' | 'SUS430'
  | 'AL5052' | 'AL6061' | 'AL1050'
  | '황동' | '동판';
export type WeldKind = 'TIG' | 'MIG' | 'MAG' | 'CO2' | 'Robot' | 'Spot';
export type TransportMethod = '' | '용달' | '자체';
export type TapSize = 'M3' | 'M4' | 'M5' | 'M6' | 'M8';

// 통합 재질 카탈로그 — 구(舊) gravity 와 material_meta 가 합쳐진 단일 행 타입.
// cutKey/group 은 판금 모드 전용이라 일부 강종(예: 비표준 도장강판)에는 비어 있을 수 있어 선택값.
export type MaterialMetaRow = {
  grade: string;            // canonicalized
  displayName: string;
  cutKey?: CutMaterialKey;  // 레이저 cutSpeed 조회 키 (판금 모드)
  group?: MaterialGroup;    // 세척 cleanMatrix 조회 키 (판금 모드)
  density: number;          // g/cm³
};

export type ThkVectorRow<K extends string> = {
  key: K;
  values: number[];       // length === THK_LIST.length
};
export type CutSpeedTable = ThkVectorRow<CutMaterialKey>[];
export type WeldSpeedTable = ThkVectorRow<Exclude<WeldKind, 'Spot'>>[];

export type PierceTimeTable = Record<string, number>; // key: string(THK_LIST 값)
export type BendTimeTable = Record<string, number>;

export type NctFeatureTable = {
  Embossing: number;
  Burring: number;
  Louver: number;
  Countersink: number;
  KnockOut: number;
  tap: Record<TapSize, number>;
};

export type CleanMatrixRow = {
  helpers: number;
  perGroup: Record<MaterialGroup, { method: string; ratePerKg: number }>;
};

export type FreightRow = {
  tonnage: string;
  base: number;
  r50_100: number;
  r100_300: number;
  r300plus: number;
  loadFee: number;
  maxKg: number;
  maxM3: number;
  note?: string;
};

export type OwnVehicleRow = {
  tonnage: string;
  fixPerHour: number;     // 원/hr
  fuelPerKm: number;      // 원/km
};

export type ProcessRateKey =
  | '레이저절단_4kW'
  | '레이저절단_6kW'
  | '벤딩_프레스브레이크'
  | 'NCT_펀치프레스'
  | '용접_TIG'
  | '용접_MIG'
  | '용접_MAG'
  | '용접_CO2'
  | '용접_로봇'
  | '도장_부스'
  | '도장_소결로'
  | '디버링'
  | '태핑';

export type ProcessRateRow = { key: ProcessRateKey; rate: number };

export type PaintConstants = {
  thkUm: number;
  densityGcm3: number;
  efficiency: number;
};

export type Assumptions = {
  overheadRate: number;       // 0.18
  marginRate: number;         // 0.10
  setupMin: number;           // 30
  minPartCost: number;        // 3000
  scrapRateDefault: number;   // 0.15
  avgSpeedKmh: number;        // 60
  loadHr: number;             // 1.0
  spotSec: number;            // 1.5
};

export type Db = {
  coil: CoilPriceRow[];
  press: PressRateRow[];
  worker: WorkerRateRow[];
  // 통합 재질 카탈로그 (구 gravity + material_meta)
  materialMeta: MaterialMetaRow[];
  cutSpeed: CutSpeedTable;
  pierceTime: PierceTimeTable;
  bendTime: BendTimeTable;
  nctFeat: NctFeatureTable;
  weldSpeed: WeldSpeedTable;
  cleanMatrix: CleanMatrixRow[];
  freightMatrix: FreightRow[];
  ownVehicleMatrix: OwnVehicleRow[];
  processRates: ProcessRateRow[];
  paint: PaintConstants;
  assumptions: Assumptions;
};

export type ProcessInput = {
  kind: PressKind;
  tonnage: number;
  uph?: number;
  workerRole: string;
};

// 공법 (process method) — 재질·치수·세척·용접·도장·운반·관리비/이윤은 공용, 이 toggle 만으로 가공 공정 영역이 바뀐다.
export type ProcessMethod = 'press' | 'sheet';

// 통합 폼 입력 — 모든 공용 섹션 + 공법별 영역을 한 슬라이스에 담는다.
export type UnifiedFormSlice = {
  // 공법
  processMethod: ProcessMethod;

  // 재질·치수 (원소재) — 공용
  material?: string;            // materialMeta or gravity grade key
  thkMm?: number;
  xMm?: number;                 // 원소재 가로 (press: 코일 폭, sheet: blank X)
  yMm?: number;                 // 원소재 세로 (press: 피치, sheet: blank Y)
  batchQty?: number;
  matPrice?: number;            // 원/kg — 비우면 coil DB 자동 조회
  scrapPrice?: number;          // 원/kg — 비우면 coil DB 자동 조회
  scrapRecovery?: number;       // 0~1, 미입력 시 1.0

  // 제품 — 공용
  volMm3?: number;
  partWidth?: number;
  partLength?: number;
  partHeight?: number;
  surfaceArea?: number;

  // 공법별 — Press
  pressProcessCount: number;
  pressProcesses: ProcessInput[];

  // 공법별 — Sheet metal (laser / bend / NCT)
  perimeterMm?: number;
  pierceN?: number;
  bendN?: number;
  nctEm?: number;
  nctBur?: number;
  nctTap?: number;
  nctLou?: number;
  nctTapSize?: TapSize;

  // 세척 — 공용
  cleanUse?: boolean;
  cleanN?: number;

  // 용접 — 공용
  weldKind?: WeldKind | '';
  weldLenMm?: number;
  weldSpots?: number;
  weldPosFactor?: number;

  // 분체 도장 — 공용
  paintUse?: boolean;
  paintAreaMm2?: number;
  paintThkUm?: number;
  paintPricePerKg?: number;
  paintTimeMin?: number;

  // 운반 — 공용
  transMethod?: TransportMethod;
  transTon?: string;
  transKm?: number;
  transRound?: boolean;
  transLoad?: number;
  transNight?: number;          // 0~0.3

  // 일반관리비·이윤 + 후공정 — 공용
  overheadRateOverride?: number;
  marginRateOverride?: number;
  postCostEa?: number;

  // 견적 비교
  quotePerEa?: number;
};

export type Verdict = '적정' | '협상' | '주의';

export type CostBreakdown = {
  // 기존 (press)
  rawWeightKg: number;
  partWeightKg: number;
  scrapWeightKg: number;
  materialCost: number;
  processCost: number;
  totalCost: number;
  warnings: string[];
  errors: string[];   // 사용자 입력 오류 (예: 원소재 중량 < 제품 중량)
  unavailable?: { reason: 'no-grade' | 'out-of-range' | 'missing-input'; message: string };
  // v10 라인 아이템 (optional, 모드별로 채움)
  laserCost?: number;
  bendCost?: number;
  nctCost?: number;
  cleanCost?: number;
  weldCost?: number;
  paintCost?: number;
  transportCost?: number;
  postCost?: number;
  // 공통 마진/관리비/should
  directCost?: number;
  overheadCost?: number;
  profitCost?: number;
  shouldCost?: number;
  appliedOverheadRate?: number;
  appliedMarginRate?: number;
  // 견적 비교
  quotePerEa?: number;
  verdict?: Verdict;
  diff?: number;
  diffPct?: number;
};

export type LookupMethod = 'exact' | 'interpolate' | 'unavailable';
