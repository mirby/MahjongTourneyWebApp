import { useEffect, useRef, useState } from 'react';

const PARTIAL_NUMBER = /^-?(\d+\.?\d*|\.\d*)?$/;

interface Props {
  value: number;
  onChange: (n: number) => void;
  readOnly?: boolean;
  disabled?: boolean;
}

/**
 * Text box that only accepts numeric input (including half-typed values like "-" or "12.").
 * Reports 0 for empty input.
 */
export function NumericInput({ value, onChange, readOnly, disabled }: Props) {
  const [text, setText] = useState(String(value));
  const lastEmitted = useRef(value);

  // Pick up changes made from outside (e.g. switching to a different table).
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      readOnly={readOnly}
      disabled={disabled}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const next = e.target.value;
        if (!PARTIAL_NUMBER.test(next)) return;
        setText(next);
        const n = parseFloat(next);
        const parsed = Number.isNaN(n) ? 0 : n;
        lastEmitted.current = parsed;
        onChange(parsed);
      }}
    />
  );
}
