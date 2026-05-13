import { useState } from 'react';
import type { UnifiedFormSlice } from '../../types/domain';
import { NumberInput } from './parts';

type Props = {
  value: Pick<
    UnifiedFormSlice,
    'transLoad' | 'transEaPerBox' | 'transBoxPerPallet' | 'transPalletPerCar'
  >;
  onPatch: (patch: Partial<UnifiedFormSlice>) => void;
};

type LoadMode = 'direct' | 'hierarchy';

function inferInitialMode(value: Props['value']): LoadMode {
  const ea = value.transEaPerBox ?? 0;
  const bp = value.transBoxPerPallet ?? 0;
  const pc = value.transPalletPerCar ?? 0;
  return ea > 0 || bp > 0 || pc > 0 ? 'hierarchy' : 'direct';
}

export function TransportLoadInputs({ value, onPatch }: Props) {
  const [mode, setMode] = useState<LoadMode>(() => inferInitialMode(value));

  const ea = value.transEaPerBox ?? 0;
  const bp = value.transBoxPerPallet ?? 0;
  const pc = value.transPalletPerCar ?? 0;
  const hierarchy = ea > 0 && bp > 0 && pc > 0 ? ea * bp * pc : 0;

  return (
    <>
      <div className="transport-mode-row">
        <span className="transport-mode-label">적재 입력 방식</span>
        <div className="mode-toggle" role="tablist" aria-label="적재 입력 방식">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'direct'}
            className={`mode-tab${mode === 'direct' ? ' active' : ''}`}
            onClick={() => setMode('direct')}
          >
            직접 입력
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'hierarchy'}
            className={`mode-tab${mode === 'hierarchy' ? ' active' : ''}`}
            onClick={() => setMode('hierarchy')}
          >
            박스/팔레트 수량 입력
          </button>
        </div>
      </div>
      {mode === 'direct' ? (
        <div className="transport-load-row">
          <NumberInput
            label="회당 적재"
            unit="EA/회"
            value={value.transLoad}
            step={1}
            onChange={(v) => onPatch({ transLoad: v })}
            placeholder="예: 100"
          />
        </div>
      ) : (
        <div className="transport-load-row">
          <NumberInput
            label="박스당 EA"
            unit="EA/box"
            value={value.transEaPerBox}
            step={1}
            onChange={(v) => onPatch({ transEaPerBox: v })}
            placeholder="예: 50"
          />
          <NumberInput
            label="팔레트당 박스"
            unit="box/팔레트"
            value={value.transBoxPerPallet}
            step={1}
            onChange={(v) => onPatch({ transBoxPerPallet: v })}
            placeholder="예: 12"
          />
          <NumberInput
            label="차량당 팔레트"
            unit="팔레트/차량"
            value={value.transPalletPerCar}
            step={1}
            onChange={(v) => onPatch({ transPalletPerCar: v })}
            placeholder="예: 6"
          />
          {hierarchy > 0 && (
            <div className="transport-mode-sum">
              회당 <b>{hierarchy.toLocaleString()}</b> EA/회 (자동 산출)
            </div>
          )}
        </div>
      )}
    </>
  );
}
