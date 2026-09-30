import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { CurrencyCode } from '@/types';
import type { CategoryBreakdown } from '@/types/dashboard';
import { categoryColor } from '@/theme/chartPalette';
import { useChartPalette } from '@/theme/themeContext';
import { formatMoney, formatPercent, toMajor } from '@/utils/money';
import { ChartTooltip } from './ChartTooltip';

interface CategoryPieChartProps {
  data: CategoryBreakdown[];
  currency: CurrencyCode;
  height?: number;
  maxSlices?: number;
}

interface Slice {
  name: string;
  valueMinor: number;
  value: number;
}

/**
 * Donut with the month's total in the centre and a ranked legend beside it.
 * Shares are only a visual reading of the backend's per-category totals.
 */
export function CategoryPieChart({
  data,
  currency,
  height = 240,
  maxSlices = 7,
}: CategoryPieChartProps) {
  const sorted = [...data]
    .filter((row) => row.amount_minor > 0)
    .sort((a, b) => b.amount_minor - a.amount_minor);
  const head = sorted.slice(0, maxSlices);
  const tail = sorted.slice(maxSlices);
  const slices: Slice[] = head.map((row) => ({
    name: row.category_name,
    valueMinor: row.amount_minor,
    value: toMajor(row.amount_minor, currency),
  }));
  if (tail.length > 0) {
    const rest = tail.reduce((sum, row) => sum + row.amount_minor, 0);
    slices.push({ name: `Other (${tail.length})`, valueMinor: rest, value: toMajor(rest, currency) });
  }
  const total = slices.reduce((sum, slice) => sum + slice.valueMinor, 0);
  const minorByName = new Map(slices.map((slice) => [slice.name, slice.valueMinor]));
  const size = Math.min(height, 220);
  const palette = useChartPalette();
  const colorForIndex = (index: number) => categoryColor(palette, index);

  return (
    <div className="oi-donut" style={{ minHeight: size }}>
      <div className="oi-donut-chart" style={{ height: size }}>
        <ResponsiveContainer width="100%" height={size} minWidth={0}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="68%"
              outerRadius="96%"
              paddingAngle={1.5}
              cornerRadius={3}
              stroke="none"
              isAnimationActive={false}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.name} fill={colorForIndex(index)} />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  format={(_value, name) => formatMoney(minorByName.get(name) ?? 0, currency)}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="oi-donut-center">
          <div className="oi-donut-total">{formatMoney(total, currency)}</div>
          <div className="oi-donut-caption">Total</div>
        </div>
      </div>
      <div className="oi-donut-legend">
        {slices.map((slice, index) => (
          <div key={slice.name} className="oi-donut-row">
            <span className="oi-swatch" style={{ background: colorForIndex(index) }} />
            <span className="oi-alloc-label">{slice.name}</span>
            <span className="oi-strong">
              {formatMoney(minorByName.get(slice.name) ?? 0, currency)}
            </span>
            <span className="oi-alloc-share">
              {total > 0 ? formatPercent((slice.valueMinor / total) * 100) : '-'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
