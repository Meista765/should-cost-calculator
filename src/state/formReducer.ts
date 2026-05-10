import type { FormSlice, PressKind, ProcessInput } from '../types/domain';

export type FormTarget = 'asIs' | 'toBe';

export type AppState = {
  asIs: FormSlice;
  toBe: FormSlice;
  toBeEnabled: boolean;
};

export type Action =
  | { type: 'PATCH'; target: FormTarget; patch: Partial<FormSlice> }
  | { type: 'SET_PROCESS_COUNT'; target: FormTarget; count: number }
  | { type: 'PATCH_PROCESS'; target: FormTarget; index: number; patch: Partial<ProcessInput> }
  | { type: 'TOGGLE_TOBE' }
  | { type: 'COPY_ASIS_TO_TOBE' };

export function defaultProcess(kind: PressKind = '프로'): ProcessInput {
  return {
    kind,
    tonnage: 35,
    uph: kind === '프로' ? 720 : 180,
    workerRole: '절단원',
  };
}

export function emptyForm(): FormSlice {
  return {
    scrapRecovery: 0.9,
    processCount: 1,
    processes: [defaultProcess()],
  };
}

export const initialState: AppState = {
  asIs: emptyForm(),
  toBe: emptyForm(),
  toBeEnabled: false,
};

function adjustProcessLength(slice: FormSlice, count: number): FormSlice {
  const safeCount = Number.isFinite(count) ? Math.min(20, Math.max(1, Math.trunc(count))) : 1;
  const cur = slice.processes;
  let next: ProcessInput[];
  if (safeCount > cur.length) {
    next = [...cur];
    while (next.length < safeCount) next.push(defaultProcess());
  } else if (safeCount < cur.length) {
    next = cur.slice(0, safeCount);
  } else {
    next = cur;
  }
  return { ...slice, processCount: safeCount, processes: next };
}

function patchProcess(
  slice: FormSlice,
  index: number,
  patch: Partial<ProcessInput>,
): FormSlice {
  const next = slice.processes.map((p, i) => {
    if (i !== index) return p;
    const merged = { ...p, ...patch };
    // kind 변경 시 uph default 자동 조정
    if (patch.kind && patch.kind !== p.kind) {
      merged.uph = patch.kind === '프로' ? 720 : 180;
    }
    return merged;
  });
  return { ...slice, processes: next };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'PATCH': {
      const slice = { ...state[action.target], ...action.patch };
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
    default:
      return state;
  }
}
