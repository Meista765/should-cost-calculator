// 관리자 패널 — inline 테이블 편집 UI + JSON 폴백
import { useState } from 'react';
import type {
  Db, CoilPriceRow, PressRateRow, WorkerRateRow,
  MaterialMetaRow, FreightRow, OwnVehicleRow, ProcessRateRow,
  NctFeatureTable, NctShapeRow, NctTapRow, CleanMatrixRow, ThkVectorRow, MaterialGroup,
} from '../types/domain';
import { THK_LIST } from '../types/domain';
import { reencryptDb, type EncryptedBundleV2, type WrapperRole } from '../lib/crypto';
import { saveBundle } from '../lib/tauriFs';
import {
  BundleConflictError,
  computeEtag,
  getStoredAdminKey,
  isRemoteConfigured,
  pushRemoteBundle,
  setStoredAdminKey,
} from '../lib/remoteBundle';

type TabKey =
  | 'coil' | 'press' | 'worker'
  | 'materialMeta' | 'cutSpeed' | 'pierceTime' | 'bendTime'
  | 'nctFeat' | 'weldSpeed' | 'cleanMatrix'
  | 'freightMatrix' | 'ownVehicleMatrix'
  | 'processRates' | 'paint' | 'assumptions';

const TAB_LABELS: Record<TabKey, string> = {
  coil: '코일가', press: '프레스 임율', worker: '작업자 임율',
  materialMeta: '재질 카탈로그', cutSpeed: '절단 속도', pierceTime: '피어싱',
  bendTime: '절곡', nctFeat: 'NCT 형상', weldSpeed: '용접 속도',
  cleanMatrix: '세척', freightMatrix: '운반(용달)', ownVehicleMatrix: '운반(자체)',
  processRates: '공정 요율', paint: '도장 상수', assumptions: '기본 가정',
};

const TAB_ORDER: TabKey[] = [
  'coil', 'press', 'worker',
  'materialMeta', 'cutSpeed', 'pierceTime', 'bendTime',
  'nctFeat', 'weldSpeed', 'cleanMatrix',
  'freightMatrix', 'ownVehicleMatrix',
  'processRates', 'paint', 'assumptions',
];

// ─── Generic row editor ───────────────────────────────────────────────────────

type ColKind = 'str' | 'num' | 'sel';
type ColDef<T> = {
  key: keyof T & string;
  label: string;
  kind: ColKind;
  opts?: readonly string[];
  w?: string;
  // 같은 값을 함께 써넣을 보조 필드 (예: grade ⇄ displayName 동기화)
  mirror?: keyof T & string;
};

function insertAfter<T>(arr: T[], i: number, item: T): T[] {
  const next = arr.slice();
  next.splice(i + 1, 0, item);
  return next;
}

function moveRow<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function RowActions({ i, len, onDup, onUp, onDown, onDel, makeEmpty, onInsertEmpty }: {
  i: number;
  len: number;
  onDup: () => void;
  onUp: () => void;
  onDown: () => void;
  onDel: () => void;
  makeEmpty?: () => unknown;
  onInsertEmpty?: () => void;
}) {
  return (
    <div className="admin-row-actions">
      {makeEmpty && onInsertEmpty && (
        <button type="button" className="admin-row-btn" title="이 행 아래에 빈 행 삽입" onClick={onInsertEmpty} aria-label="빈 행 삽입">＋</button>
      )}
      <button type="button" className="admin-row-btn" title="이 행 아래에 복제 삽입" onClick={onDup} aria-label="복제">⎘</button>
      <button type="button" className="admin-row-btn" title="위로" onClick={onUp} disabled={i === 0} aria-label="위로">↑</button>
      <button type="button" className="admin-row-btn" title="아래로" onClick={onDown} disabled={i === len - 1} aria-label="아래로">↓</button>
      <button type="button" className="admin-row-btn admin-row-del" title="삭제" onClick={onDel} aria-label="삭제">−</button>
    </div>
  );
}

function RowEditor<T extends object>({
  data, cols, onChange, makeEmpty,
}: {
  data: T[];
  cols: ColDef<T>[];
  onChange: (next: T[]) => void;
  makeEmpty?: () => T;
}) {
  function set(i: number, key: string, val: unknown, mirror?: string) {
    onChange(data.map((r, ri) => {
      if (ri !== i) return r;
      const next: Record<string, unknown> = { ...(r as Record<string, unknown>), [key]: val };
      if (mirror) next[mirror] = val;
      return next as T;
    }));
  }
  const actionsW = makeEmpty ? '152px' : '128px';
  return (
    <div className="admin-table-wrap">
      <table className="admin-grid-table">
        <thead>
          <tr>
            {cols.map(c => <th key={c.key} style={c.w ? { width: c.w } : undefined}>{c.label}</th>)}
            <th style={{ width: actionsW }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const r = row as Record<string, unknown>;
            return (
              <tr key={i}>
                {cols.map(c => (
                  <td key={c.key}>
                    {c.kind === 'sel' ? (
                      <select value={String(r[c.key] ?? '')} onChange={e => set(i, c.key, e.target.value, c.mirror)}>
                        {c.opts!.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : c.kind === 'num' ? (
                      <input type="number" value={r[c.key] as number ?? 0}
                        onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) set(i, c.key, v, c.mirror); }} />
                    ) : (
                      <input type="text" value={String(r[c.key] ?? '')}
                        onChange={e => set(i, c.key, e.target.value, c.mirror)} />
                    )}
                  </td>
                ))}
                <td>
                  <RowActions
                    i={i} len={data.length}
                    onDup={() => onChange(insertAfter(data, i, structuredClone(row)))}
                    onUp={() => onChange(moveRow(data, i, -1))}
                    onDown={() => onChange(moveRow(data, i, 1))}
                    onDel={() => onChange(data.filter((_, ri) => ri !== i))}
                    makeEmpty={makeEmpty}
                    onInsertEmpty={makeEmpty ? () => onChange(insertAfter(data, i, makeEmpty())) : undefined}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {makeEmpty && (
        <button type="button" className="admin-add-row" onClick={() => onChange([...data, makeEmpty()])}>
          + 맨 아래에 행 추가
        </button>
      )}
    </div>
  );
}

// ─── Flat object (paint, assumptions) ────────────────────────────────────────

function FlatObjectEditor({ data, labels, onChange }: {
  data: Record<string, number>;
  labels: Record<string, string>;
  onChange: (next: Record<string, number>) => void;
}) {
  return (
    <div className="admin-table-wrap admin-kv-wrap">
      <table className="admin-grid-table admin-kv-table">
        <thead><tr><th>항목</th><th>값</th></tr></thead>
        <tbody>
          {Object.entries(labels).map(([k, label]) => (
            <tr key={k}>
              <td className="admin-kv-key">{label}</td>
              <td>
                <input type="number" value={data[k] ?? 0}
                  onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) onChange({ ...data, [k]: v }); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Record<string, number> (pierceTime, bendTime) ───────────────────────────

function RecordNumberEditor({ data, keyLabel, valLabel, onChange }: {
  data: Record<string, number>;
  keyLabel: string;
  valLabel: string;
  onChange: (next: Record<string, number>) => void;
}) {
  return (
    <div className="admin-table-wrap admin-kv-wrap">
      <table className="admin-grid-table admin-kv-table">
        <thead><tr><th>{keyLabel}</th><th>{valLabel}</th></tr></thead>
        <tbody>
          {Object.entries(data).map(([k, v]) => (
            <tr key={k}>
              <td className="admin-kv-key">{k}</td>
              <td>
                <input type="number" value={v}
                  onChange={e => { const n = e.target.valueAsNumber; if (!isNaN(n)) onChange({ ...data, [k]: n }); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Matrix (cutSpeed, weldSpeed) ────────────────────────────────────────────

function MatrixEditor({ data, onChange }: {
  data: ThkVectorRow<string>[];
  onChange: (next: ThkVectorRow<string>[]) => void;
}) {
  function set(ri: number, ci: number, v: number) {
    onChange(data.map((row, r) => r !== ri ? row : { ...row, values: row.values.map((old, c) => c === ci ? v : old) }));
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-grid-table admin-matrix">
        <thead>
          <tr>
            <th className="admin-matrix-key">재질</th>
            {THK_LIST.map(t => <th key={t}>{t}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={row.key}>
              <td className="admin-matrix-key">{row.key}</td>
              {row.values.map((v, ci) => (
                <td key={ci}>
                  <input type="number" value={v}
                    onChange={e => { const n = e.target.valueAsNumber; if (!isNaN(n)) set(ri, ci, n); }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── NctFeat ─────────────────────────────────────────────────────────────────

const NCT_SHAPE_COLS: ColDef<NctShapeRow>[] = [
  { key: 'shape', label: '형상', kind: 'str', w: '160px' },
  { key: 'sec',   label: '시간(sec/개)', kind: 'num', w: '140px' },
];
const NCT_TAP_COLS: ColDef<NctTapRow>[] = [
  { key: 'size', label: '탭 사이즈', kind: 'str', w: '160px' },
  { key: 'sec',  label: '시간(sec/개)', kind: 'num', w: '140px' },
];

function NctFeatEditor({ data, onChange }: { data: NctFeatureTable; onChange: (next: NctFeatureTable) => void }) {
  return (
    <>
      <div className="admin-section-divider">NCT 형상</div>
      <RowEditor<NctShapeRow>
        data={data.shapes}
        cols={NCT_SHAPE_COLS}
        onChange={(rows) => onChange({ ...data, shapes: rows })}
        makeEmpty={() => ({ shape: '', sec: 0 })}
      />
      <div className="admin-section-divider">탭 공정</div>
      <RowEditor<NctTapRow>
        data={data.tap}
        cols={NCT_TAP_COLS}
        onChange={(rows) => onChange({ ...data, tap: rows })}
        makeEmpty={() => ({ size: '', sec: 0 })}
      />
    </>
  );
}

// ─── CleanMatrix ─────────────────────────────────────────────────────────────

const MAT_GROUPS: MaterialGroup[] = ['탄소강', 'STS', '비철'];
const emptyCleanRow = (): CleanMatrixRow => ({
  helpers: 0,
  perGroup: { '탄소강': { method: '', ratePerKg: 0 }, 'STS': { method: '', ratePerKg: 0 }, '비철': { method: '', ratePerKg: 0 } },
});

function CleanMatrixEditor({ data, onChange }: { data: CleanMatrixRow[]; onChange: (next: CleanMatrixRow[]) => void }) {
  function setHelpers(i: number, v: number) {
    onChange(data.map((r, ri) => ri === i ? { ...r, helpers: v } : r));
  }
  function setGroup(i: number, g: MaterialGroup, field: 'method' | 'ratePerKg', v: string | number) {
    onChange(data.map((r, ri) => ri !== i ? r
      : { ...r, perGroup: { ...r.perGroup, [g]: { ...r.perGroup[g], [field]: v } } }));
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-grid-table">
        <thead>
          <tr>
            <th style={{ width: '60px' }}>조수</th>
            {MAT_GROUPS.flatMap(g => [
              <th key={`${g}-m`}>{g} 방법</th>,
              <th key={`${g}-r`}>{g} 원/kg</th>,
            ])}
            <th style={{ width: '152px' }}>관리</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              <td>
                <input type="number" value={row.helpers}
                  onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setHelpers(i, v); }} />
              </td>
              {MAT_GROUPS.flatMap(g => [
                <td key={`${g}-m`}>
                  <input type="text" value={row.perGroup[g]?.method ?? ''}
                    onChange={e => setGroup(i, g, 'method', e.target.value)} />
                </td>,
                <td key={`${g}-r`}>
                  <input type="number" value={row.perGroup[g]?.ratePerKg ?? 0}
                    onChange={e => { const v = e.target.valueAsNumber; if (!isNaN(v)) setGroup(i, g, 'ratePerKg', v); }} />
                </td>,
              ])}
              <td>
                <RowActions
                  i={i} len={data.length}
                  onDup={() => onChange(insertAfter(data, i, structuredClone(row)))}
                  onUp={() => onChange(moveRow(data, i, -1))}
                  onDown={() => onChange(moveRow(data, i, 1))}
                  onDel={() => onChange(data.filter((_, ri) => ri !== i))}
                  makeEmpty={emptyCleanRow}
                  onInsertEmpty={() => onChange(insertAfter(data, i, emptyCleanRow()))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="admin-add-row" onClick={() => onChange([...data, emptyCleanRow()])}>
        + 맨 아래에 행 추가
      </button>
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

const CUT_KEYS = ['SS400','SPHC','SPCC','SECC','SGCC','SUS304','SUS316','SUS430','AL5052','AL6061','AL1050','황동','동판'] as const;
const PROC_KEYS = ['레이저절단_4kW','레이저절단_6kW','벤딩_프레스브레이크','NCT_펀치프레스','용접_TIG','용접_MIG','용접_MAG','용접_CO2','용접_로봇','용접_점용접','도장_부스','도장_소결로','디버링','태핑'] as const;

// grade ⇄ displayName 동기화: 입력란 하나로 두 필드 동시 업데이트 (조인 키 + 라벨)
const COIL_COLS:    ColDef<CoilPriceRow>[]       = [{ key:'grade', label:'강종', kind:'str', w:'140px', mirror:'displayName' }, { key:'thickness', label:'두께(mm)', kind:'num', w:'85px' }, { key:'coilPrice', label:'코일가(원/kg)', kind:'num', w:'110px' }, { key:'scrapPrice', label:'스크랩(원/kg)', kind:'num', w:'115px' }];
const PRESS_COLS:   ColDef<PressRateRow>[]        = [{ key:'kind', label:'종류', kind:'sel', opts:['단발','프로'], w:'80px' }, { key:'tonnage', label:'톤수(ton)', kind:'num', w:'90px' }, { key:'rate', label:'임율(원/hr)', kind:'num', w:'110px' }];
const WORKER_COLS:  ColDef<WorkerRateRow>[]       = [{ key:'category', label:'업종', kind:'str', w:'140px' }, { key:'code', label:'직종코드', kind:'num', w:'80px' }, { key:'role', label:'직종명', kind:'str' }, { key:'rate', label:'임율(원/hr)', kind:'num', w:'110px' }];
const META_COLS:    ColDef<MaterialMetaRow>[]     = [{ key:'grade', label:'강종', kind:'str', w:'140px' }, { key:'displayName', label:'강종명', kind:'str' }, { key:'cutKey', label:'절단 키', kind:'sel', opts:['', ...CUT_KEYS] }, { key:'group', label:'재질군', kind:'sel', opts:['','탄소강','STS','비철'], w:'80px' }, { key:'density', label:'비중(g/cm³)', kind:'num', w:'100px' }];
const FREIGHT_COLS: ColDef<FreightRow>[]          = [{ key:'tonnage', label:'톤수', kind:'str', w:'65px' }, { key:'base', label:'기본(원)', kind:'num', w:'90px' }, { key:'r50_100', label:'50~100km', kind:'num', w:'90px' }, { key:'r100_300', label:'100~300km', kind:'num', w:'95px' }, { key:'r300plus', label:'300km+', kind:'num', w:'85px' }, { key:'loadFee', label:'상하차(원)', kind:'num', w:'90px' }, { key:'maxKg', label:'최대kg', kind:'num', w:'80px' }, { key:'maxM3', label:'최대m³', kind:'num', w:'80px' }, { key:'note', label:'비고', kind:'str' }];
const OWN_COLS:     ColDef<OwnVehicleRow>[]       = [{ key:'tonnage', label:'톤수', kind:'str', w:'80px' }, { key:'fixPerHour', label:'고정(원/hr)', kind:'num', w:'110px' }, { key:'fuelPerKm', label:'연료(원/km)', kind:'num', w:'110px' }];
const PROC_COLS:    ColDef<ProcessRateRow>[]      = [{ key:'key', label:'공정', kind:'sel', opts:[...PROC_KEYS] }, { key:'rate', label:'임율(원/hr)', kind:'num', w:'110px' }];

const PAINT_LABELS: Record<string, string> = { thkUm:'도막두께 기본값(μm)', densityGcm3:'도료 비중(g/cm³)', efficiency:'도장 효율(0~1)' };
const ASSUMP_LABELS: Record<string, string> = { overheadRate:'일반관리비율', marginRate:'이윤율', setupMin:'셋업 시간(min)', scrapRateDefault:'스크랩율 기본값', avgSpeedKmh:'평균 속도(km/h)', loadHr:'상하차 시간(hr)', spotSec:'Spot 용접 시간(sec)' };

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  db: Db;
  bundle: EncryptedBundleV2;
  etag: string | null;
  dek: CryptoKey;
  role: WrapperRole;
  onClose: () => void;
  onDbUpdated: (nextDb: Db, nextBundle: EncryptedBundleV2, nextEtag: string | null) => void;
};

export default function AdminPanel({ db, bundle, etag, dek, role, onClose, onDbUpdated }: Props) {
  const [draft, setDraft] = useState<Db>(() => structuredClone(db));
  const [tab, setTab] = useState<TabKey>('coil');
  const [showJson, setShowJson] = useState(false);
  const [json, setJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  function switchTab(next: TabKey) {
    if (next === tab) return;
    if (showJson) {
      try {
        const parsed = JSON.parse(json);
        const updated = { ...draft, [tab]: parsed } as Db;
        setDraft(updated);
        setJson(JSON.stringify((updated as Record<string, unknown>)[next], null, 2));
        setParseError(null);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setTab(next);
    setParseError(null);
  }

  function openJson() {
    setJson(JSON.stringify((draft as unknown as Record<string, unknown>)[tab], null, 2));
    setShowJson(true);
    setParseError(null);
  }

  function closeJson() {
    try {
      const parsed = JSON.parse(json);
      setDraft(d => ({ ...d, [tab]: parsed } as Db));
      setShowJson(false);
      setParseError(null);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    }
  }

  function onTableChange(val: unknown) {
    setDraft(d => ({ ...d, [tab]: val } as Db));
  }

  async function saveAll() {
    if (busy) return;
    let merged = draft;
    if (showJson) {
      try { merged = { ...draft, [tab]: JSON.parse(json) } as Db; }
      catch (e) { setParseError(e instanceof Error ? e.message : String(e)); return; }
    }
    try {
      setBusy(true);
      const nextBundle = await reencryptDb(merged, dek, bundle, role);

      if (isRemoteConfigured()) {
        let adminKey = getStoredAdminKey();
        if (!adminKey) {
          adminKey = window.prompt('관리자 API 키를 입력하세요 (1회만, 이후 자동 저장)') ?? '';
          if (!adminKey) { setParseError('관리자 API 키가 필요합니다.'); return; }
          setStoredAdminKey(adminKey);
        }
        if (etag === null) {
          setParseError('현재 원격 버전을 알 수 없어 저장할 수 없습니다. 페이지를 새로고침해 주세요.');
          return;
        }
        try {
          const result = await pushRemoteBundle(nextBundle, etag, adminKey, 'admin');
          await saveBundle(nextBundle);
          setSavedAt(new Date().toLocaleString('ko-KR'));
          setDraft(merged);
          onDbUpdated(merged, nextBundle, result.etag);
        } catch (e) {
          if (e instanceof BundleConflictError) {
            setParseError('다른 관리자가 먼저 저장했습니다. 잠금 해제부터 다시 시도하세요.');
          } else if (e instanceof Error && e.message.includes('관리자 키')) {
            setStoredAdminKey(null);
            setParseError(e.message);
          } else {
            setParseError(e instanceof Error ? e.message : String(e));
          }
        }
      } else {
        await saveBundle(nextBundle);
        setSavedAt(new Date().toLocaleString('ko-KR'));
        setDraft(merged);
        onDbUpdated(merged, nextBundle, await computeEtag(nextBundle));
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function renderEditor() {
    const d = (draft as unknown as Record<string, unknown>)[tab];
    switch (tab) {
      case 'coil':
        return <RowEditor<CoilPriceRow> data={d as CoilPriceRow[]} cols={COIL_COLS} onChange={onTableChange}
          makeEmpty={() => ({ grade:'', displayName:'', thickness:0, coilPrice:0, scrapPrice:0 })} />;
      case 'press':
        return <RowEditor<PressRateRow> data={d as PressRateRow[]} cols={PRESS_COLS} onChange={onTableChange}
          makeEmpty={() => ({ kind:'단발', tonnage:0, rate:0 })} />;
      case 'worker':
        return <RowEditor<WorkerRateRow> data={d as WorkerRateRow[]} cols={WORKER_COLS} onChange={onTableChange}
          makeEmpty={() => ({ role:'', rate:0, category:'', code:0 })} />;
      case 'materialMeta':
        return <RowEditor<MaterialMetaRow> data={d as MaterialMetaRow[]} cols={META_COLS} onChange={onTableChange}
          makeEmpty={() => ({ grade:'', gradeRaw:'', displayName:'', cutKey: undefined, group: undefined, density:0 })} />;
      case 'cutSpeed':
        return <MatrixEditor data={d as ThkVectorRow<string>[]} onChange={onTableChange} />;
      case 'weldSpeed':
        return <MatrixEditor data={d as ThkVectorRow<string>[]} onChange={onTableChange} />;
      case 'pierceTime':
        return <RecordNumberEditor data={d as Record<string, number>} keyLabel="두께(mm)" valLabel="피어싱 시간(min)" onChange={onTableChange} />;
      case 'bendTime':
        return <RecordNumberEditor data={d as Record<string, number>} keyLabel="두께(mm)" valLabel="절곡 시간(min/bend)" onChange={onTableChange} />;
      case 'nctFeat':
        return <NctFeatEditor data={d as NctFeatureTable} onChange={onTableChange} />;
      case 'cleanMatrix':
        return <CleanMatrixEditor data={d as CleanMatrixRow[]} onChange={onTableChange} />;
      case 'freightMatrix':
        return <RowEditor<FreightRow> data={d as FreightRow[]} cols={FREIGHT_COLS} onChange={onTableChange}
          makeEmpty={() => ({ tonnage:'', base:0, r50_100:0, r100_300:0, r300plus:0, loadFee:0, maxKg:0, maxM3:0 })} />;
      case 'ownVehicleMatrix':
        return <RowEditor<OwnVehicleRow> data={d as OwnVehicleRow[]} cols={OWN_COLS} onChange={onTableChange}
          makeEmpty={() => ({ tonnage:'', fixPerHour:0, fuelPerKm:0 })} />;
      case 'processRates':
        return <RowEditor<ProcessRateRow> data={d as ProcessRateRow[]} cols={PROC_COLS} onChange={onTableChange}
          makeEmpty={() => ({ key:'레이저절단_4kW', rate:0 })} />;
      case 'paint':
        return <FlatObjectEditor data={d as Record<string, number>} labels={PAINT_LABELS} onChange={onTableChange} />;
      case 'assumptions':
        return <FlatObjectEditor data={d as Record<string, number>} labels={ASSUMP_LABELS} onChange={onTableChange} />;
    }
  }

  return (
    <section className="admin-panel" aria-label="관리자 패널">
      <div className="section-heading">
        <h2>관리자 패널 — 단가 DB 편집</h2>
        <button type="button" onClick={onClose}>닫기</button>
      </div>
      <div className="admin-tabs">
        {TAB_ORDER.map(k => (
          <button key={k} type="button" className={`admin-tab${tab === k ? ' active' : ''}`} onClick={() => switchTab(k)}>
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="admin-body">
        <div className="admin-actions">
          <span className="admin-tab-title">{TAB_LABELS[tab]}</span>
          <span className="spacer" />
          <button type="button" className="admin-json-toggle" onClick={showJson ? closeJson : openJson}>
            {showJson ? '테이블로 보기' : 'JSON 편집'}
          </button>
          <button type="button" className="primary" disabled={busy} onClick={saveAll}>
            {busy ? '저장 중…' : '저장 & 재암호화'}
          </button>
          {savedAt && <span className="muted small">저장됨: {savedAt}</span>}
        </div>
        {parseError && <p className="error" role="alert">⚠ {parseError}</p>}
        {showJson ? (
          <textarea id="admin-json" className="admin-json" rows={22} spellCheck={false}
            value={json} onChange={e => { setJson(e.target.value); setParseError(null); }} />
        ) : (
          renderEditor()
        )}
      </div>
    </section>
  );
}
