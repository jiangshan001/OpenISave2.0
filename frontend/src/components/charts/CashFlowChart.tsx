import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

interface CashFlowChartProps {
  data: CashFlowPoint[];
  currency: CurrencyCode;
  height?: number;
  showNetLine?: boolean;
}

export function CashFlowChart({
  data,
  currency,
  height = 280,
  showNetLine = true,
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--oi-border)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={70}
          tickFormatter={(value: number) => formatCompact(backToMinor(value), currency)}
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatMoney(backToMinor(value), currency),
            name,
          ]}
        />
        <Legend iconType="circle" />
        <Bar dataKey="Income" fill="#22a06b" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="Expense" fill="#d4543a" radius={[4, 4, 0, 0]} maxBarSize={28} />
        {showNetLine ? (
          <Line type="monotone" dataKey="Net" stroke="#2f6feb" strokeWidth={2} dot={false} />
        ) : null}
      </Chart>
    </ResponsiveContainer>
  );
}
