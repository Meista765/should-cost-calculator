import type { UnifiedFormSlice } from '../../types/domain';
import { NumberInput } from './parts';

type Props = {
  value: Pick<UnifiedFormSlice, 'transBoxWeightKg' | 'transBoxVolumeM3'>;
  onPatch: (patch: Partial<UnifiedFormSlice>) => void;
};

export function TransportLimitInputs({ value, onPatch }: Props) {
  return (
    <div className="grid grid-3 transport-hierarchy">
      <NumberInput
        label="박스 무게"
        unit="kg/box"
        value={value.transBoxWeightKg}
        step={0.1}
        onChange={(v) => onPatch({ transBoxWeightKg: v })}
        placeholder="선택"
        hint="차량 한계 검증용"
      />
      <NumberInput
        label="박스 부피"
        unit="m³/box"
        value={value.transBoxVolumeM3}
        step={0.01}
        onChange={(v) => onPatch({ transBoxVolumeM3: v })}
        placeholder="선택"
        hint="차량 한계 검증용"
      />
    </div>
  );
}
