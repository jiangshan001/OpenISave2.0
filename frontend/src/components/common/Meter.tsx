interface MeterProps {
  /** 0-100; values outside the range are clamped for display only. */
  percent: number | null | undefined;
  color: string;
  size?: 'md' | 'lg';
  label?: string;
}

/** Thin rounded progress track shared by budgets and goals. */
export function Meter({ percent, color, size = 'md', label }: MeterProps) {
  const width = Math.max(0, Math.min(percent ?? 0, 100));
  return (
    <div
      className={`oi-meter${size === 'lg' ? ' oi-meter--lg' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-label={label}
    >
      <span style={{ width: `${width}%`, background: color }} />
    </div>
  );
}
