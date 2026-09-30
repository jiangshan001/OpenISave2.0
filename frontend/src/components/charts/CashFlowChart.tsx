import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { CurrencyCode } from '@/types';
import type { CashFlowPoint } from '@/types/dashboard';
import { formatMonthKey } from '@/utils/dates';
import { CURRENCY_META, formatCompact, formatMoney, toMajor } from '@/utils/money';
import { useChartPalette } from '@/theme/themeContext';
import { prefersReducedMotion } from './chartTheme';
import { ChartTooltip } from './ChartTooltip';

interface CashFlowChartProps {
  data: CashFlowPoint[];
  currency: CurrencyCode;
  height?: number;
  showNetLine?: boolean;
  /** Stretch to the parent's height (with `height` as the minimum). */
  grow?: boolean;
}



export function CashFlowChart({
  data,
  currency,
  height = 280,
  showNetLine = true,
  grow = false,
}: CashFlowChartProps) {
  const rows = data.map((point) => ({
    month: formatMonthKey(point.month),
    Income: toMajor(point.income_minor, currency),
    Expense: toMajor(point.expense_minor, currency),
    Net: toMajor(point.net_minor, currency),
  }));

  const Chart = showNetLine ? ComposedChart : BarChart;
  const digits = CURRENCY_META[currency]?.digits ?? 2;
  const backToMinor = (value: number) => Math.round(value * 10 ** digits);
  const animate = !prefersReducedMotion();
  const palette = useChartPalette();
  const tick = { fontSize: 11.5, fill: palette.axis };

  return (
    <div className={grow ? 'oi-chart-grow' : undefined}>
      <div className="oi-chart-legend" aria-hidden>
        <span className="oi-chart-key">
          <i style={{ background: palette.income }} />
          Income
        </span>
        <span className="oi-chart-key">
          <i style={{ background: palette.expense }} />
          Expense
        </span>
        {showNetLine ? (
          <span className="oi-chart-key">
            <i className="oi-chart-key--line" style={{ background: palette.net }} />
            Net
          </span>
        ) : null}
      </div>
      <div className="oi-chart-body" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height={grow ? '100%' : height} minHeight={height}>
          <Chart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={4}>
            <CartesianGrid vertical={false} stroke={palette.grid} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={tick} dy={6} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={tick}
              width={64}
              tickFormatter={(value: number) => formatCompact(backToMinor(value), currency)}
            />
            <Tooltip
              cursor={{ fill: palette.cursor }}
              content={
                <ChartTooltip format={(value) => formatMoney(backToMinor(value), currency)} />
              }
            />
            <Bar
              dataKey="Income"
              fill={palette.income}
              radius={[5, 5, 2, 2]}
              maxBarSize={22}
              isAnimationActive={animate}
              animationDuration={500}
            />
            <Bar
              dataKey="Expense"
              fill={palette.expense}
              radius={[5, 5, 2, 2]}
              maxBarSize={22}
              isAnimationActive={animate}
              animationDuration={500}
            />
            {showNetLine ? (
              <Line
                type="monotone"
                dataKey="Net"
                stroke={palette.net}
                strokeWidth={2}
                dot={{ r: 3, fill: palette.dotFill, stroke: palette.net, strokeWidth: 2 }}
                activeDot={{ r: 4.5, fill: palette.net, stroke: palette.dotFill, strokeWidth: 2 }}
                isAnimationActive={animate}
                animationDuration={500}
              />
            ) : null}
          </Chart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
