import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { CurrencyCode } from '@/types';
import type { CategoryBreakdown } from '@/types/dashboard';
import { colorForIndex } from '@/utils/labels';
import { formatMoney, toMajor } from '@/utils/money';

interface CategoryPieChartProps {
  data: CategoryBreakdown[];
  currency: CurrencyCode;
  height?: number;
  maxSlices?: number;
}

export function CategoryPieChart({
  data,
  currency,
  height = 280,
  maxSlices = 8,
}: CategoryPieChartProps) {
  const sorted = [...data].sort((a, b) => b.amount_minor - a.amount_minor);
  const head = sorted.slice(0, maxSlices);
  const tail = sorted.slice(maxSlices);
  const slices = head.map((row) => ({
    name: row.category_name,
    valueMinor: row.amount_minor,
    value: toMajor(row.amount_minor, currency),
  }));
  if (tail.length > 0) {
    const rest = tail.reduce((sum, row) => sum + row.amount_minor, 0);
    slices.push({ name: `Other (${tail.length})`, valueMinor: rest, value: toMajor(rest, currency) });
  }

  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          innerRadius="45%"
          outerRadius="72%"
          paddingAngle={2}
          stroke="none"
          isAnimationActive={false}
        >
          {slices.map((slice, index) => (
            <Cell key={slice.name} fill={colorForIndex(index)} />
          ))}
        </Pie>
        <Tooltip
          formatter={(_value, _name, entry) => [
            formatMoney((entry?.payload as { valueMinor: number }).valueMinor, currency),
            (entry?.payload as { name: string }).name,
          ]}
        />
        <Legend
          layout="horizontal"
          align="center"
          verticalAlign="bottom"
          iconType="circle"
          formatter={(value) => <span className="oi-legend-label">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
