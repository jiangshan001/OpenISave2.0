import { PieChartOutlined } from '@ant-design/icons';
import { Card } from 'antd';

import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
import { EmptyState } from '@/components/common/EmptyState';
import type { CurrencyCode } from '@/types';
import type { CategoryBreakdown } from '@/types/dashboard';

interface CategorySplitCardProps {
  title: string;
  rows: CategoryBreakdown[];
  currency: CurrencyCode;
  emptyText: string;
}

/** Donut of this month's totals per category, as aggregated by the backend. */
export function CategorySplitCard({ title, rows, currency, emptyText }: CategorySplitCardProps) {
  const hasData = rows.some((row) => row.amount_minor > 0);
  return (
    <Card title={title} variant="borderless" className="oi-card-fill">
      {hasData ? (
        <CategoryPieChart data={rows} currency={currency} />
      ) : (
        <EmptyState
          icon={<PieChartOutlined />}
          title={emptyText}
          text="Categorised transactions appear here as soon as they are recorded."
        />
      )}
    </Card>
  );
}
