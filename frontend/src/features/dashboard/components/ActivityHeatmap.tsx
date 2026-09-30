import { Empty, Segmented, Skeleton } from 'antd';
import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

import { useDashboardActivity } from '@/hooks/useResources';
import { useChartPalette } from '@/theme/themeContext';
import type { ActivityKind, DailyActivity } from '@/types/dashboard';
import { formatDate } from '@/utils/dates';
import { formatMoney } from '@/utils/money';
import { buildHeatmapGrid, type HeatmapCell } from './heatmapLayout';
import '@/styles/heatmap.css';

const CELL = 11;
const STEP = 14;
const LEFT = 30;
const TOP = 16;
const WEEKDAY_LABELS: [number, string][] = [
  [0, 'Mon'],
  [2, 'Wed'],
  [4, 'Fri'],
];

const KIND_OPTIONS = [
  { label: 'Expenses', value: 'expense' },
  { label: 'Income', value: 'income' },
];

interface HoverState {
  cell: HeatmapCell;
  x: number;
  y: number;
}

/** Flat analytical section: title and toggle, figures, then the grid itself. */
function HeatmapSection({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="oi-heat-section oi-section-gap" aria-label={title}>
      <header className="oi-heat-header">
        <h2 className="oi-section-title">{title}</h2>
        {extra}
      </header>
      {children}
    </section>
  );
}

/** Heatmap body for an already-loaded activity payload; owns the toggle. */
export function ActivityHeatmapPanel({ data }: { data: DailyActivity }) {
  const palette = useChartPalette();
  const [kind, setKind] = useState<ActivityKind>('expense');
  const [hover, setHover] = useState<HoverState | null>(null);
  const series = data.series[kind];
  const grid = useMemo(
    () => buildHeatmapGrid(data.start, data.end, series.days),
    [data.start, data.end, series.days],
  );
  const base = data.base_currency;
  const colors = palette.heatmap[kind];
  const width = LEFT + grid.weeks.length * STEP;
  const height = TOP + 7 * STEP;
  const noun = kind === 'expense' ? 'Spent' : 'Received';
  const busiest =
    series.max_minor > 0
      ? series.days.find((day) => day.amount_minor === series.max_minor)?.date
      : undefined;

  const onEnter = (cell: HeatmapCell) => (event: MouseEvent<SVGRectElement>) => {
    const box = event.currentTarget.closest('.oi-heatmap')?.getBoundingClientRect();
    const rect = event.currentTarget.getBoundingClientRect();
    setHover({
      cell,
      x: rect.left - (box?.left ?? 0) + rect.width / 2,
      y: rect.top - (box?.top ?? 0),
    });
  };

  return (
    <HeatmapSection
      title={kind === 'expense' ? 'Daily spending' : 'Daily income'}
      extra={
        <Segmented
          size="small"
          options={KIND_OPTIONS}
          value={kind}
          onChange={(value) => {
            setHover(null);
            setKind(value as ActivityKind);
          }}
        />
      }
    >
      <div className="oi-heatmap-stats">
        <div>
          <div className="oi-stat-label">
            {noun} in the last {data.months} months
          </div>
          <div className="oi-heatmap-stat">{formatMoney(series.total_minor, base)}</div>
        </div>
        <div>
          <div className="oi-stat-label">Active days</div>
          <div className="oi-heatmap-stat">{series.active_days}</div>
        </div>
        {series.max_minor > 0 && series.active_days > 1 ? (
          <div>
            <div className="oi-stat-label">Busiest day</div>
            <div className="oi-heatmap-stat">
              {formatMoney(series.max_minor, base)}{' '}
              {busiest ? <span className="oi-heatmap-on">on {formatDate(busiest)}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
      <div
        className="oi-heatmap"
        onMouseLeave={() => setHover(null)}
        style={{ '--oi-heat-hover': palette.heatmapHover } as CSSProperties}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          role="img"
          aria-label={`${noun} per day, ${formatDate(data.start)} to ${formatDate(data.end)}`}
        >
          {grid.monthLabels.map(({ week, label }) => (
            <text key={`${week}-${label}`} x={LEFT + week * STEP} y={10} className="oi-heatmap-label">
              {label}
            </text>
          ))}
          {WEEKDAY_LABELS.map(([row, label]) => (
            <text key={label} x={0} y={TOP + row * STEP + CELL - 2} className="oi-heatmap-label">
              {label}
            </text>
          ))}
          {grid.weeks.map((week, column) =>
            week.map((cell) =>
              cell.inRange ? (
                <rect
                  key={cell.date}
                  data-testid="heatmap-cell"
                  data-date={cell.date}
                  data-level={cell.level}
                  x={LEFT + column * STEP}
                  y={TOP + cell.weekday * STEP}
                  width={CELL}
                  height={CELL}
                  rx={2.5}
                  fill={colors[cell.level] ?? colors[0]}
                  onMouseEnter={onEnter(cell)}
                />
              ) : null,
            ),
          )}
        </svg>
        {hover ? (
          <div className="oi-heatmap-tooltip" style={{ left: hover.x, top: hover.y }} role="tooltip">
            <div className="oi-strong">{formatDate(hover.cell.date)}</div>
            <div>
              {kind === 'expense' ? 'Expenses' : 'Income'}{' '}
              {formatMoney(hover.cell.amountMinor, base)}
            </div>
            {hover.cell.count > 0 ? (
              <div className="oi-muted">
                {hover.cell.count} transaction{hover.cell.count === 1 ? '' : 's'}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="oi-heatmap-legend">
        <span>Less</span>
        {colors.map((color) => (
          <span key={color} className="oi-heatmap-swatch" style={{ background: color }} />
        ))}
        <span>More</span>
        <span className="oi-heatmap-note">In {base}, transfers excluded</span>
      </div>
    </HeatmapSection>
  );
}

/** Overview section: last 12 months of daily income or expenses. */
export function ActivityHeatmapCard() {
  const { data, isLoading, error } = useDashboardActivity(12);
  if (data) return <ActivityHeatmapPanel data={data} />;
  return (
    <HeatmapSection title="Daily spending">
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <span className="oi-muted">
              {error ? 'Daily activity could not be loaded' : 'No activity yet'}
            </span>
          }
        />
      )}
    </HeatmapSection>
  );
}
