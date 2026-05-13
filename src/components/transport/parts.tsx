function parseFiniteNumber(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function NumberInput(props: {
  label: string;
  unit?: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  placeholder?: string;
  hint?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const { label, unit, value, onChange, step = 0.1, min = 0, placeholder, hint, ariaLabel, disabled } = props;
  const hasRangeError = !disabled && value != null && value < min;
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {unit && <em className="unit">({unit})</em>}
      </span>
      <input
        type="number"
        step={step}
        min={min}
        value={value ?? ''}
        onChange={(e) => onChange(parseFiniteNumber(e.target.value))}
        placeholder={placeholder}
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        className={hasRangeError ? 'input-invalid' : undefined}
        aria-invalid={hasRangeError}
      />
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
