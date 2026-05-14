import type { PressKind, ProcessInput, ProcessMethod, UnifiedFormSlice } from '../types/domain';
import type { WrapperRole } from '../lib/crypto';

export type FormTarget = 'asIs' | 'toBe';

export type AppState = {
  role: WrapperRole | null;
  asIs: UnifiedFormSlice;
  toBe: UnifiedFormSlice;
  toBeEnabled: boolean;
};

export type Action =
  | { type: 'PATCH'; target: FormTarget; patch: Partial<UnifiedFormSlice> }
  | { type: 'SET_PROCESS_METHOD'; target: FormTarget; method: ProcessMethod }
  | { type: 'SET_PROCESS_COUNT'; target: FormTarget; count: number }
  | { type: 'PATCH_PROCESS'; target: FormTarget; index: number; patch: Partial<ProcessInput> }
  | { type: 'TOGGLE_TOBE' }
  | { type: 'COPY_ASIS_TO_TOBE' }
  | { type: 'SET_ROLE'; role: WrapperRole | null }
  | { type: 'RESET_FOR_LOCK' };

export function defaultProcess(kind: PressKind = '프로'): ProcessInput {
  return {
    kind,
    tonnage: 35,
    uph: kind === '프로' ? 720 : 180,
    workerRole: '절단원',
  };
}

export function emptyForm(): UnifiedFormSlice {
  return {
    processMethod: 'press',
    scrapRecovery: 0.9,
    batchQty: 10000,
    transRound: true,
    cleanUse: false,
    paintUse: false,
    priceOverride: false,
    pressProcessCount: 1,
    pressProcesses: [defaultProcess()],
    paintThkUm: 200,
    overheadRateOverride: 0.15,
    marginRateOverride: 0.15,
    postCostRows: [],
    weldRows: [],
  };
}

export const initialState: AppState = {
  role: null,
  asIs: emptyForm(),
  toBe: emptyForm(),
  toBeEnabled: false,
};

function adjustProcessLength(slice: UnifiedFormSlice, count: number): UnifiedFormSlice {
  const safeCount = Number.isFinite(count) ? Math.min(20, Math.max(1, Math.trunc(count))) : 1;
  const cur = slice.pressProcesses;
  let next: ProcessInput[];
  if (safeCount > cur.length) {
    next = [...cur];
    while (next.length < safeCount) next.push(defaultProcess());
  } else if (safeCount < cur.length) {
    next = cur.slice(0, safeCount);
  } else {
    next = cur;
  }
  return { ...slice, pressProcessCount: safeCount, pressProcesses: next };
}

function patchProcess(
  slice: UnifiedFormSlice,
  index: number,
  patch: Partial<ProcessInput>,
): UnifiedFormSlice {
  const next = slice.pressProcesses.map((p, i) => {
    if (i !== index) return p;
    const merged = { ...p, ...patch };
    if (patch.kind && patch.kind !== p.kind) {
      merged.uph = patch.kind === '프로' ? 720 : 180;
    }
    return merged;
  });
  return { ...slice, pressProcesses: next };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'PATCH': {
      const slice = { ...state[action.target], ...action.patch };
      return { ...state, [action.target]: slice };
    }
    case 'SET_PROCESS_METHOD': {
      const slice = { ...state[action.target], processMethod: action.method };
      return { ...state, [action.target]: slice };
    }
    case 'SET_PROCESS_COUNT': {
      const next = adjustProcessLength(state[action.target], action.count);
      return { ...state, [action.target]: next };
    }
    case 'PATCH_PROCESS': {
      const next = patchProcess(state[action.target], action.index, action.patch);
      return { ...state, [action.target]: next };
    }
    case 'TOGGLE_TOBE':
      return { ...state, toBeEnabled: !state.toBeEnabled };
    case 'COPY_ASIS_TO_TOBE':
      return { ...state, toBe: structuredClone(state.asIs), toBeEnabled: true };
    case 'SET_ROLE':
      return { ...state, role: action.role };
    case 'RESET_FOR_LOCK':
      return { ...initialState };
    default:
      return state;
  }
}
