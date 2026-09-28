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
  expense: ['#eef0f3', '#f7dcd2', '#eeb09a', '#df7d62', '#b0503a'],
  income: ['#eef0f3', '#d3ebdf', '#98cfb3', '#4ea57f', '#22724f'],
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
      <div className="oi-heatmap-stats">
        <div>
          <div className="oi-stat-label">
            {noun} in the last {data.months} months
          </div>
          <div className="oi-heatmap-stat">
            <span className="oi-strong">{formatMoney(series.total_minor, base)}</span>
          </div>
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
              {busiest ? <span className="oi-muted">on {formatDate(busiest)}</span> : null}
            </div>
          </div>
        ) : null}
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
      <div className="oi-heatmap-legend oi-muted">
        <span>Less</span>
        {colors.map((color) => (
          <span key={color} className="oi-heatmap-swatch" style={{ background: color }} />
        ))}
        <span>More</span>
        <span className="oi-heatmap-note">In {base}, transfers excluded</span>
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
