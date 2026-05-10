import { useEffect, useMemo, useReducer, useState } from 'react';
import { computeBreakdown } from '../lib/calc';
import { type EncryptedBundle } from '../lib/crypto';
import { initialState, reducer } from '../state/formReducer';
import { AsIsForm } from './AsIsForm';
import { ResultsPanel } from './ResultsPanel';
import { CaseOneSimulator } from './CaseOneSimulator';
import { CaseTwoComparison } from './CaseTwoComparison';
import { PasswordPrompt } from './PasswordPrompt';
import encryptedJson from '../data/encrypted.json';
import type { CostBreakdown, Db } from '../types/domain';

const bundle = encryptedJson as EncryptedBundle;

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

// 이전 버전에서 sessionStorage에 비밀번호를 캐시하던 흔적 제거 (업그레이드 안전장치).
const LEGACY_PW_CACHE_KEY = 'should-cost-pw-v1';
try {
  sessionStorage.removeItem(LEGACY_PW_CACHE_KEY);
} catch {
  // sessionStorage 비활성 환경에서는 무시.
}

export function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);

  // 탭이 백그라운드로 가거나 닫힐 때 복호화된 DB를 메모리에서 폐기.
  // 비밀번호는 어디에도 캐시하지 않으므로 다시 입력해야 한다.
  useEffect(() => {
    if (!db) return;
    const wipe = () => setDb(null);
    window.addEventListener('pagehide', wipe);
    window.addEventListener('beforeunload', wipe);
    return () => {
      window.removeEventListener('pagehide', wipe);
      window.removeEventListener('beforeunload', wipe);
    };
  }, [db]);

  const asIsBreakdown = useMemo(
    () => (db ? computeBreakdown(state.asIs, db) : EMPTY_BREAKDOWN),
    [state.asIs, db],
  );
  const toBeBreakdown = useMemo(
    () => (db ? computeBreakdown(state.toBe, db) : EMPTY_BREAKDOWN),
    [state.toBe, db],
  );

  if (!db) {
    return (
      <div className="app">
        <header>
          <h1>판금 프레스 Should-Cost 계산기</h1>
        </header>
        <main>
          <PasswordPrompt
            bundle={bundle}
            onUnlocked={(loaded) => setDb(loaded)}
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
        <button onClick={() => setDb(null)}>잠금</button>
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
