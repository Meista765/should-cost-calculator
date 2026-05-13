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

// 통합 재질 카탈로그 — 구(舊) gravity 와 material_meta 가 합쳐진 단일 행 타입.
// cutKey/group 은 판금 모드 전용이라 일부 강종(예: 비표준 도장강판)에는 비어 있을 수 있어 선택값.
export type MaterialMetaRow = {
  grade: string;            // canonicalized — 매칭 키 (코일가 등 테이블 간 join)
  gradeRaw: string;         // 원본 강종 표기 (공백·괄호 보존). 표시 전용.
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

export type NctShapeRow = { shape: string; sec: number };
export type NctTapRow = { size: string; sec: number };
export type NctFeatureTable = {
  shapes: NctShapeRow[];
  tap: NctTapRow[];
};

// NCT 가공도 행 — 방법별로 사양/갯수가 달라지는 단일 표현
export type NctMethod = 'Embossing' | 'Burring' | 'Louver' | 'KnockOut' | 'Tap';
export type NctRow = {
  method: NctMethod;
  count?: number;
  tapSize?: string;        // method === 'Tap' 일 때만 유효
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

export type PostCostRow = {
  label: string;
  costEa: number;
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
  matPrice?: number;            // 원/kg — priceOverride=true일 때만 사용
  scrapPrice?: number;          // 원/kg — priceOverride=true일 때만 사용
  priceOverride?: boolean;      // true: matPrice/scrapPrice 사용자값 사용. false/미정: coil DB 자동조회
  scrapRecovery?: number;       // 0~1, 미입력 시 1.0

  // 제품 — 공용
  volMm3?: number;
  partWidth?: number;
  partLength?: number;
  partHeight?: number;

  // 공법별 — Press
  pressProcessCount: number;
  pressProcesses: ProcessInput[];

  // 공법별 — Sheet metal (laser / bend / NCT)
  perimeterMm?: number;
  pierceN?: number;
  bendN?: number;
  nctRows?: NctRow[];

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
  // 운반 — 적재 계층 (선택; 3개 모두 양수면 자동 곱셈으로 transLoad 대체)
  transEaPerBox?: number;       // EA/box
  transBoxPerPallet?: number;   // box/pallet
  transPalletPerCar?: number;   // pallet/car
  transBoxWeightKg?: number;    // kg/box (한계 검증용, 선택)
  transBoxVolumeM3?: number;    // m³/box (한계 검증용, 선택)

  // 일반관리비·이윤 + 후공정 — 공용
  overheadRateOverride?: number;
  marginRateOverride?: number;
  postCostRows: PostCostRow[];
};

export type TransportTrace = {
  perTrip: number;
  trips: number;
  total: number;
  perEa: number;
  loadSource: 'hierarchy' | 'direct' | 'none';
  effectiveLoad: number;
  eaPerBox?: number;
  boxPerPallet?: number;
  palletPerCar?: number;
  boxesPerTrip?: number;
  kgPerTrip?: number;
  m3PerTrip?: number;
  maxKg?: number;
  maxM3?: number;
  overWeight: boolean;
  overVolume: boolean;
};

// ----- 섹션별 계산식 표시용 상세 (UI 의 SectionFormula 가 그대로 소비) -----
export type MaterialDetail = {
  density: number;
  orderKg: number;
  netKg: number;
  scrapKg: number;
  scrapRecover: number;
  netMatCost: number;
  matPrice: number;
  scrapPrice: number;
  scrapRecovery: number;
  scrapRateDefault: number;
  xMm: number;
  yMm: number;
  thkMm: number;
  volMm3: number;
  netFromVolume: boolean;
  volumeMissing: boolean;
  priceWarning?: string;
};

export type LaserDetail = {
  cutSpeed: number;        // mm/min (lookup)
  pierceSec: number;        // sec/회 (lookup)
  cutMin: number;           // 분/EA
  laserCost: number;        // 원/EA
  rate: number;             // 원/분 (lookup)
  rateKey: ProcessRateKey;
  perimeterMm: number;
  pierceN: number;
};

export type BendDetail = {
  bendSec: number;
  bendMin: number;
  bendCost: number;
  rate: number;
  bendN: number;
  setupMin: number;
  batchQty: number;
};

export type NctShapeTotal = {
  method: Exclude<NctMethod, 'Tap'>;
  shape: string;
  count: number;
  sec: number;              // 단위 sec (lookup)
  totalSec: number;         // count × sec
};
export type NctTapTotal = {
  size: string;
  count: number;
  sec: number;
  totalSec: number;
};
export type NctDetail = {
  featSec: number;
  nctMin: number;
  nctCostBatch: number;
  perEa: number;
  rate: number;
  setupMin: number;
  batchQty: number;
  shapeTotals: NctShapeTotal[];
  tapTotals: NctTapTotal[];
};

export type CleanDetail = {
  method: string;
  rate: number;
  perEa: number;
  netKg: number;
  helpers: number;
  group?: MaterialGroup;
};

export type WeldDetail = {
  kind: WeldKind;
  weldMin: number;
  perEa: number;
  rate: number;
  rateKey: ProcessRateKey;
  posFactor: number;
  spots: number;
  spotSec: number;
  lengthMm: number;
  speed: number;            // mm/min (seam 만 의미 있음)
};

export type PaintDetail = {
  paintGEa: number;
  paintMatEa: number;
  paintLaborEa: number;
  perEa: number;
  areaMm2: number;
  thkUm: number;
  densityGcm3: number;
  efficiency: number;
  pricePerKg: number;
  timeMin: number;
  boothRate: number;
  furnaceRate: number;
};

export type PressRowDetail = {
  index: number;
  kind: PressKind;
  tonnage: number;
  uph?: number;
  machineRate?: number;
  workerRate?: number;
  workerRole: string;
  perEa: number;
  ok: boolean;
  reason?: string;
};

export type PressDetail = {
  rows: PressRowDetail[];
  total: number;
};

export type MarginDetail = {
  direct: number;
  materialCost: number;
  processCost: number;
  transportCost: number;
  postCost: number;
  overheadRate: number;
  marginRate: number;
  overheadCost: number;
  profitCost: number;
  rawSum: number;            // direct + overhead + profit
  shouldCost: number;
};

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
  transportDetail?: TransportTrace;
  postCost?: number;
  // 공통 마진/관리비/should
  directCost?: number;
  overheadCost?: number;
  profitCost?: number;
  shouldCost?: number;
  appliedOverheadRate?: number;
  appliedMarginRate?: number;
  // 섹션별 계산식 표시용 상세 (UI 전용, optional)
  materialDetail?: MaterialDetail;
  laserDetail?: LaserDetail;
  bendDetail?: BendDetail;
  nctDetail?: NctDetail;
  cleanDetail?: CleanDetail;
  weldDetail?: WeldDetail;
  paintDetail?: PaintDetail;
  pressDetail?: PressDetail;
  marginDetail?: MarginDetail;
};

export type LookupMethod = 'exact' | 'interpolate' | 'unavailable';
