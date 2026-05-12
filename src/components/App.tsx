import { Suspense, lazy, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { computeBreakdown } from '../lib/calc';
import { isV2, type EncryptedBundle, type WrapperRole } from '../lib/crypto';
import { loadBundle } from '../lib/tauriFs';
import { initialState, reducer } from '../state/formReducer';
import { UnifiedForm } from './UnifiedForm';
import { ResultsPanel } from './ResultsPanel';
import { CaseTwoComparison } from './CaseTwoComparison';
import { PasswordPrompt } from './PasswordPrompt';
import { PasswordChangeDialog } from './PasswordChangeDialog';
import type { CostBreakdown, Db } from '../types/domain';

const AdminPanel = lazy(() => import('./AdminPanel'));

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

const LEGACY_PW_CACHE_KEY = 'should-cost-pw-v1';
try {
  sessionStorage.removeItem(LEGACY_PW_CACHE_KEY);
} catch {
  // sessionStorage 비활성 환경에서는 무시.
}

export function App() {
  const [bundle, setBundle] = useState<EncryptedBundle | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [bundleError, setBundleError] = useState<string | null>(null);
  const [db, setDb] = useState<Db | null>(null);
  const [role, setRole] = useState<WrapperRole | null>(null);
  const dekRef = useRef<CryptoKey | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPwChange, setShowPwChange] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadBundle()
      .then((loaded) => {
        if (cancelled) return;
        setBundle(loaded.bundle);
        setEtag(loaded.etag);
      })
      .catch((err) => {
        if (!cancelled) setBundleError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 탭이 백그라운드로 가거나 닫힐 때 복호화된 DB/DEK를 메모리에서 폐기.
  useEffect(() => {
    if (!db) return;
    const wipe = () => {
      setDb(null);
      setRole(null);
      dekRef.current = null;
      setShowAdmin(false);
      setShowPwChange(false);
    };
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

  if (!bundle) {
    return (
      <div className="app">
        <header>
          <h1>판금 Should-Cost 계산기</h1>
        </header>
        <main>
          <section className="form-card">
            <h2>데이터 불러오는 중…</h2>
            {bundleError && (
              <p className="error" role="alert">⚠ {bundleError}</p>
            )}
          </section>
        </main>
      </div>
    );
  }

  if (!db || !role) {
    return (
      <div className="app">
        <header>
          <h1>판금 Should-Cost 계산기</h1>
        </header>
        <main>
          <PasswordPrompt
            bundle={bundle}
            onUnlocked={(loaded, r, dek) => {
              setDb(loaded);
              setRole(r);
              dekRef.current = dek;
              dispatch({ type: 'SET_ROLE', role: r });
            }}
          />
        </main>
      </div>
    );
  }

  const dataDate = new Date(bundle.encryptedAt).toLocaleString('ko-KR');
  const isAdmin = role === 'admin';
  const v2bundle = isV2(bundle) ? bundle : null;

  function lock() {
    setDb(null);
    setRole(null);
    dekRef.current = null;
    setShowAdmin(false);
    setShowPwChange(false);
    dispatch({ type: 'RESET_FOR_LOCK' });
  }

  return (
    <div className="app">
      <header>
        <h1>판금 Should-Cost 계산기</h1>
        <span className="muted small">데이터 갱신 시각: {dataDate}</span>
        <div className="spacer" />
        <span className="role-badge">{isAdmin ? '관리자' : '사용자'}</span>
        {isAdmin && v2bundle && (
          <>
            <button onClick={() => setShowAdmin(true)}>관리자 패널</button>
            <button onClick={() => setShowPwChange(true)}>비밀번호 변경</button>
          </>
        )}
        <button onClick={lock}>잠금</button>
      </header>

      <main>
        {showAdmin && isAdmin && v2bundle && dekRef.current && (
          <Suspense fallback={<p className="muted">관리자 패널 로딩 중…</p>}>
            <AdminPanel
              db={db}
              bundle={v2bundle}
              etag={etag}
              dek={dekRef.current}
              onClose={() => setShowAdmin(false)}
              onDbUpdated={(nextDb, nextBundle, nextEtag) => {
                setDb(nextDb);
                setBundle(nextBundle);
                setEtag(nextEtag);
              }}
            />
          </Suspense>
        )}

        {showPwChange && v2bundle && dekRef.current && (
          <PasswordChangeDialog
            bundle={v2bundle}
            etag={etag}
            dek={dekRef.current}
            role={role}
            onClose={() => setShowPwChange(false)}
            onChanged={(nextBundle, nextEtag) => {
              setBundle(nextBundle);
              setEtag(nextEtag);
              setShowPwChange(false);
            }}
          />
        )}

        <div className="two-col">
          <UnifiedForm
            title="AS-IS 사양"
            value={state.asIs}
            onPatch={(patch) => dispatch({ type: 'PATCH', target: 'asIs', patch })}
            onSetMethod={(method) =>
              dispatch({ type: 'SET_PROCESS_METHOD', target: 'asIs', method })
            }
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

        <CaseTwoComparison
          enabled={state.toBeEnabled}
          onToggle={() => dispatch({ type: 'TOGGLE_TOBE' })}
          onCopyFromAsIs={() => dispatch({ type: 'COPY_ASIS_TO_TOBE' })}
          asIsBreakdown={asIsBreakdown}
          toBeBreakdown={toBeBreakdown}
        />

        {state.toBeEnabled && (
          <div className="two-col">
            <UnifiedForm
              title="TO-BE 사양"
              value={state.toBe}
              onPatch={(patch) => dispatch({ type: 'PATCH', target: 'toBe', patch })}
              onSetMethod={(method) =>
                dispatch({ type: 'SET_PROCESS_METHOD', target: 'toBe', method })
              }
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
        <p className="muted small">
          모든 단가는 KRW/EA 기준. 데이터는 이 PC 외부로 전송되지 않습니다.
        </p>
      </footer>
    </div>
  );
}
