import { Card, Empty, Segmented, Skeleton } from 'antd';
import { useMemo, useState, type MouseEvent } from 'react';

import { useDashboardActivity } from '@/hooks/useResources';
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

/** Index = backend intensity level 0-4. Level 0 is an empty day. */
export const LEVEL_COLORS: Record<ActivityKind, string[]> = {
  expense: ['#eef1f5', '#f9d3c8', '#f0a086', '#e06a4b', '#b23c22'],
  income: ['#eef1f5', '#c8ecd9', '#86d0a8', '#3fae74', '#17794a'],
};

const KIND_OPTIONS = [
  { label: 'Expenses', value: 'expense' },
  { label: 'Income', value: 'income' },
];

interface HoverState {
  cell: HeatmapCell;
  x: number;
  y: number;
}

/** Heatmap body for an already-loaded activity payload; owns the toggle. */
export function ActivityHeatmapPanel({ data }: { data: DailyActivity }) {
  const [kind, setKind] = useState<ActivityKind>('expense');
  const [hover, setHover] = useState<HoverState | null>(null);
  const series = data.series[kind];
  const grid = useMemo(
    () => buildHeatmapGrid(data.start, data.end, series.days),
    [data.start, data.end, series.days],
  );
  const base = data.base_currency;
  const colors = LEVEL_COLORS[kind];
  const width = LEFT + grid.weeks.length * STEP;
  const height = TOP + 7 * STEP;
  const noun = kind === 'expense' ? 'Spent' : 'Received';

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
    <Card
      title={kind === 'expense' ? 'Daily spending' : 'Daily income'}
      variant="borderless"
      className="oi-section-gap"
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
      <div className="oi-heatmap-summary oi-muted">
        {noun} <span className="oi-strong">{formatMoney(series.total_minor, base)}</span> over the
        last {data.months} months · {series.active_days} active day
        {series.active_days === 1 ? '' : 's'}
        {series.max_minor > 0 ? ` · Busiest day ${formatMoney(series.max_minor, base)}` : ''}
      </div>
      <div className="oi-heatmap" onMouseLeave={() => setHover(null)}>
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
                  rx={2}
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
      <div className="oi-heatmap-legend oi-muted">
        <span>Less</span>
        {colors.map((color) => (
          <span key={color} className="oi-heatmap-swatch" style={{ background: color }} />
        ))}
        <span>More</span>
        <span className="oi-heatmap-note">In {base} · transfers excluded</span>
      </div>
    </Card>
  );
}

/** Overview card: last 12 months of daily income or expenses. */
export function ActivityHeatmapCard() {
  const { data, isLoading, error } = useDashboardActivity(12);
  if (data) return <ActivityHeatmapPanel data={data} />;
  return (
    <Card title="Daily spending" variant="borderless" className="oi-section-gap">
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
    </Card>
  );
}
