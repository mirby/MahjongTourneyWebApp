import { NumericInput } from './NumericInput';

interface Props {
  title: string;
  values: number[];
  /** Number of inputs to show (4 for yonma, 3 for sanma). */
  count: number;
  onChange: (values: number[]) => void;
}

export function UmaInputs({ title, values, count, onChange }: Props) {
  return (
    <div className="row">
      <div className="label">{title}</div>
      <div className="value">
        {Array.from({ length: count }, (_, i) => (
          <NumericInput
            key={i}
            value={values[i] ?? 0}
            onChange={(v) => {
              const next = [...values];
              next[i] = v;
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}
