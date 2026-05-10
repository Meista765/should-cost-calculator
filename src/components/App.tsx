import { useEffect, useMemo, useReducer, useState } from 'react';
import { computeBreakdown } from '../lib/calc';
import { clearDb, loadDb, loadMeta, saveDb, type StoredMeta } from '../lib/storage';
import { initialState, reducer } from '../state/formReducer';
import { AsIsForm } from './AsIsForm';
import { ResultsPanel } from './ResultsPanel';
import { CaseOneSimulator } from './CaseOneSimulator';
import { CaseTwoComparison } from './CaseTwoComparison';
import { DataImport } from './DataImport';
import type { CostBreakdown, Db } from '../types/domain';

const EMPTY_BREAKDOWN: CostBreakdown = {
  rawWeightKg: 0,
  partWeightKg: 0,
  scrapWeightKg: 0,
  materialCost: 0,
  processCost: 0,
  totalCost: 0,
  warnings: [],
};

export function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [meta, setMeta] = useState<StoredMeta | null>(null);
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    setDb(loadDb());
    setMeta(loadMeta());
  }, []);

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
          <DataImport
            onLoaded={(loaded) => {
              const m = saveDb(loaded);
              setDb(loaded);
              setMeta(m);
            }}
          />
        </main>
      </div>
    );
  }

  const importedDate = meta ? new Date(meta.importedAt).toLocaleString('ko-KR') : '—';

  return (
    <div className="app">
      <header>
        <h1>판금 프레스 Should-Cost 계산기</h1>
        <span className="muted small">데이터 가져온 시각: {importedDate}</span>
        <div className="spacer" />
        <button
          onClick={() => {
            if (confirm('저장된 데이터를 지우고 다시 가져오시겠습니까?')) {
              clearDb();
              setDb(null);
              setMeta(null);
            }
          }}
        >
          데이터 다시 가져오기
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
