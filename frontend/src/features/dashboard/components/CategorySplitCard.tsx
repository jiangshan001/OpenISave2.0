import { Card, Empty } from 'antd';

import { CategoryPieChart } from '@/components/charts/CategoryPieChart';
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
    <Card title={title} variant="borderless" style={{ height: '100%' }}>
      {hasData ? (
        <CategoryPieChart data={rows} currency={currency} />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="oi-muted">{emptyText}</span>}
        />
      )}
    </Card>
  );
}
