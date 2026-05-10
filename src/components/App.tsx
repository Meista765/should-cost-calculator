import { useEffect, useMemo, useReducer, useState } from 'react';
import { computeBreakdown } from '../lib/calc';
import { decryptDb, type EncryptedBundle } from '../lib/crypto';
import { initialState, reducer } from '../state/formReducer';
import { AsIsForm } from './AsIsForm';
import { ResultsPanel } from './ResultsPanel';
import { CaseOneSimulator } from './CaseOneSimulator';
import { CaseTwoComparison } from './CaseTwoComparison';
import { PasswordPrompt } from './PasswordPrompt';
import encryptedJson from '../data/encrypted.json';
import type { CostBreakdown, Db } from '../types/domain';

const bundle = encryptedJson as EncryptedBundle;
const PW_CACHE_KEY = 'should-cost-pw-v1';

function getCachedPassword(): string | null {
  try {
    return sessionStorage.getItem(PW_CACHE_KEY);
  } catch {
    return null;
  }
}

function setCachedPassword(password: string): void {
  try {
    sessionStorage.setItem(PW_CACHE_KEY, password);
  } catch {
    // Storage may be unavailable in restricted browser modes; unlock should still work.
  }
}

function clearCachedPassword(): void {
  try {
    sessionStorage.removeItem(PW_CACHE_KEY);
  } catch {
    // Storage may be unavailable in restricted browser modes; locking should still work.
  }
}

const EMPTY_BREAKDOWN: CostBreakdown = {
  rawWeightKg: 0,
  partWeightKg: 0,
  scrapWeightKg: 0,
  materialCost: 0,
  processCost: 0,
  totalCost: 0,
  warnings: [],
  errors: [],
};

export function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [autoUnlocking, setAutoUnlocking] = useState(true);
  const [state, dispatch] = useReducer(reducer, initialState);

  // 같은 탭 세션 동안 자동 잠금 해제
  useEffect(() => {
    const cached = getCachedPassword();
    if (!cached) {
      setAutoUnlocking(false);
      return;
    }
    decryptDb(bundle, cached)
      .then(setDb)
      .catch(clearCachedPassword)
      .finally(() => setAutoUnlocking(false));
  }, []);

  const asIsBreakdown = useMemo(
    () => (db ? computeBreakdown(state.asIs, db) : EMPTY_BREAKDOWN),
    [state.asIs, db],
  );
  const toBeBreakdown = useMemo(
    () => (db ? computeBreakdown(state.toBe, db) : EMPTY_BREAKDOWN),
    [state.toBe, db],
  );

  if (autoUnlocking) {
    return (
      <div className="app">
        <header>
          <h1>판금 프레스 Should-Cost 계산기</h1>
        </header>
        <main>
          <p className="muted">잠금 해제 중…</p>
        </main>
      </div>
    );
  }

  if (!db) {
    return (
      <div className="app">
        <header>
          <h1>판금 프레스 Should-Cost 계산기</h1>
        </header>
        <main>
          <PasswordPrompt
            bundle={bundle}
            onUnlocked={(loaded, password) => {
              setCachedPassword(password);
              setDb(loaded);
            }}
          />
        </main>
      </div>
    );
  }

  const dataDate = new Date(bundle.encryptedAt).toLocaleString('ko-KR');

  return (
    <div className="app">
      <header>
        <h1>판금 프레스 Should-Cost 계산기</h1>
        <span className="muted small">데이터 갱신 시각: {dataDate}</span>
        <div className="spacer" />
        <button
          onClick={() => {
            clearCachedPassword();
            setDb(null);
          }}
        >
          잠금
        </button>
      </header>

      <main>
        <div className="two-col">
          <AsIsForm
            title="AS-IS 사양"
            value={state.asIs}
            onPatch={(patch) => dispatch({ type: 'PATCH', target: 'asIs', patch })}
            onSetProcessCount={(count) =>
              dispatch({ type: 'SET_PROCESS_COUNT', target: 'asIs', count })
            }
            onPatchProcess={(index, patch) =>
              dispatch({ type: 'PATCH_PROCESS', target: 'asIs', index, patch })
            }
            db={db}
          />
          <ResultsPanel title="AS-IS 결과" breakdown={asIsBreakdown} />
        </div>

        <CaseOneSimulator asIs={state.asIs} asIsBreakdown={asIsBreakdown} db={db} />

        <CaseTwoComparison
          enabled={state.toBeEnabled}
          onToggle={() => dispatch({ type: 'TOGGLE_TOBE' })}
          onCopyFromAsIs={() => dispatch({ type: 'COPY_ASIS_TO_TOBE' })}
          asIsBreakdown={asIsBreakdown}
          toBeBreakdown={toBeBreakdown}
        />

        {state.toBeEnabled && (
          <div className="two-col">
            <AsIsForm
              title="TO-BE 사양"
              value={state.toBe}
              onPatch={(patch) => dispatch({ type: 'PATCH', target: 'toBe', patch })}
              onSetProcessCount={(count) =>
                dispatch({ type: 'SET_PROCESS_COUNT', target: 'toBe', count })
              }
              onPatchProcess={(index, patch) =>
                dispatch({ type: 'PATCH_PROCESS', target: 'toBe', index, patch })
              }
              db={db}
            />
            <ResultsPanel title="TO-BE 결과" breakdown={toBeBreakdown} />
          </div>
        )}
      </main>

      <footer>
        <p className="muted small">모든 단가는 KRW/EA 기준. 데이터는 이 브라우저 외부로 전송되지 않습니다.</p>
      </footer>
    </div>
  );
}
