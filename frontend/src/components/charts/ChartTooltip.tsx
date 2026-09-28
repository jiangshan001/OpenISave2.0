interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: { fill?: string };
}

interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** Formats a plotted value (major units) back into display money. */
  format: (value: number, name: string) => string;
}

/** Card-style tooltip shared by the Recharts charts. */
export function ChartTooltip({ active, label, payload, format }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="oi-chart-tooltip">
      {label !== undefined ? <div className="oi-chart-tooltip-title">{label}</div> : null}
      {payload.map((entry) => (
        <div key={String(entry.dataKey ?? entry.name)} className="oi-chart-tooltip-row">
          <span className="oi-swatch" style={{ background: entry.color ?? entry.payload?.fill }} />
          <span>{entry.name}</span>
          <strong>{format(Number(entry.value ?? 0), String(entry.name ?? ''))}</strong>
        </div>
      ))}
    </div>
  );
}
