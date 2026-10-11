import { useId, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { CurrencyCode } from '@/types';
import type { CategoryBreakdown } from '@/types/dashboard';
import { categoryColor } from '@/theme/chartPalette';
import { useChartPalette } from '@/theme/themeContext';
import { formatMoney, formatPercent, toMajor } from '@/utils/money';
import { DonutPatterns, patternSwatch } from './DonutPatterns';

interface CategoryPieChartProps {
  data: CategoryBreakdown[];
  currency: CurrencyCode;
  height?: number;
  maxSlices?: number;
}

const rowKey = (row: CategoryBreakdown) => String(row.category_id ?? 'uncategorised');
const ranked = (rows: CategoryBreakdown[]) => [...rows]
  .filter((row) => row.amount_minor > 0).sort((a, b) => b.amount_minor - a.amount_minor);

/** Ranked parent totals; click a sector or legend row to explore its children. */
export function CategoryPieChart({ data, currency, height = 240, maxSlices = 7 }: CategoryPieChartProps) {
  const [path, setPath] = useState<string[]>([]);
  const patternId = 'donut-' + useId().replace(/:/g, '');
  const palette = useChartPalette();
  const roots = ranked(data);
  const trail: CategoryBreakdown[] = [];
  let visible = roots;
  for (const key of path) {
    const parent = visible.find((row) => rowKey(row) === key && row.children?.length);
    if (!parent) break; // A refetch can remove a category from this month's breakdown.
    trail.push(parent);
    visible = ranked(parent.children ?? []);
  }
  const current = trail.at(-1);
  const head = visible.slice(0, maxSlices);
  const tail = visible.slice(maxSlices);
  const slices = head.map((row) => ({
    key: rowKey(row), name: row.category_name,
    valueMinor: row.amount_minor, value: toMajor(row.amount_minor, currency), row,
  }));
  if (tail.length > 0) {
    const rest = tail.reduce((sum, row) => sum + row.amount_minor, 0);
    slices.push({ key: 'other', name: 'Other (' + tail.length + ')', valueMinor: rest,
      value: toMajor(rest, currency), row: {
        category_id: null, category_name: 'Other', parent_name: null, amount_minor: rest,
      } });
  }
  // Only chart proportions are derived here; all category amounts are backend totals.
  const total = slices.reduce((sum, slice) => sum + slice.valueMinor, 0);
  const size = Math.min(height, 220);
  const parentIndex = trail.length ? roots.findIndex((row) => rowKey(row) === rowKey(trail[0])) : 0;
  const parentColor = categoryColor(palette, Math.max(parentIndex, 0));
  const colorForIndex = (index: number) => current ? parentColor : categoryColor(palette, index);
  const drillInto = (row: CategoryBreakdown) => {
    if (row.children?.length) setPath([...trail.map(rowKey), rowKey(row)]);
  };

  return (
    <div>
      {current ? (
        <nav className="oi-donut-nav" aria-label="Category breakdown">
          <button type="button" onClick={() => setPath([])}>All categories</button>
          {trail.map((row, index) => (
            <span key={rowKey(row)}>
              <span aria-hidden="true"> / </span>
              {index === trail.length - 1 ? <strong aria-current="page">{row.category_name}</strong> : (
                <button type="button" onClick={() => setPath(trail.slice(0, index + 1).map(rowKey))}>
                  {row.category_name}
                </button>
              )}
            </span>
          ))}
        </nav>
      ) : data.some((row) => row.children?.length) ? (
        <p className="oi-donut-hint">Select a parent category to see its breakdown.</p>
      ) : null}
      <div className="oi-donut" style={{ minHeight: size }}>
        <div className="oi-donut-chart" style={{ height: size }}>
          <ResponsiveContainer width="100%" height={size} minWidth={0}>
            <PieChart>
              {current ? <defs><DonutPatterns prefix={patternId} count={slices.length}
                color={parentColor} ink={palette.dotFill} /></defs> : null}
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius="68%"
                outerRadius="96%" paddingAngle={1.5} cornerRadius={3} stroke="none"
                isAnimationActive={false} onClick={(slice) => drillInto(slice.row)}>
                {slices.map((slice, index) => (
                  <Cell key={slice.key} fill={current ? 'url(#' + patternId + '-' + index + ')' : colorForIndex(index)}
                    style={{ cursor: slice.row.children?.length ? 'pointer' : 'default' }} />
                ))}
              </Pie>
              <Tooltip content={({ active, payload }) => {
                const slice = payload?.[0]?.payload as typeof slices[number] | undefined;
                return active && slice ? (
                  <div className="oi-chart-tooltip">
                    <div className="oi-chart-tooltip-title">{slice.name}</div>
                    <strong>{formatMoney(slice.valueMinor, currency)}</strong>
                    <div className="oi-muted">{formatPercent(total ? slice.valueMinor / total * 100 : 0)}
                      {current ? ' of ' + current.category_name : ' of total'}</div>
                  </div>
                ) : null;
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="oi-donut-center">
            <div className="oi-donut-total">{formatMoney(total, currency)}</div>
            <div className="oi-donut-caption" title={current?.category_name}>
              {current?.category_name ?? 'Total'}
            </div>
          </div>
        </div>
        <div className="oi-donut-legend" aria-label={current ? current.category_name + ' breakdown' : 'Categories'}>
          {slices.map((slice, index) => {
            const expandable = Boolean(slice.row.children?.length);
            const content = (
              <>
                <span className="oi-swatch" style={current
                  ? patternSwatch(parentColor, palette.dotFill, index)
                  : { background: colorForIndex(index) }} />
                <span className="oi-alloc-label" title={slice.name}>
                  {slice.name}{expandable ? <span aria-hidden="true"> ›</span> : null}
                </span>
                <span className="oi-strong">{formatMoney(slice.valueMinor, currency)}</span>
                <span className="oi-alloc-share">
                  {total > 0 ? formatPercent((slice.valueMinor / total) * 100) : '-'}
                </span>
              </>
            );
            return expandable ? (
              <button key={slice.key} type="button" className="oi-donut-row oi-donut-drill"
                aria-label={'View ' + slice.name + ' breakdown'} onClick={() => drillInto(slice.row)}>
                {content}
              </button>
            ) : <div key={slice.key} className="oi-donut-row">{content}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
