import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useBudget, useCategories } from '@/hooks/useResources';
import { currentPeriod, monthLabel } from '@/utils/dates';
import { CategoryBudgetsSection } from './components/CategoryBudgetsSection';
import { OverallBudgetPanel } from './components/OverallBudgetPanel';
import { PeriodPicker } from './components/PeriodPicker';

export function BudgetPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const { data, isLoading, error, refetch } = useBudget(period.year, period.month);
  const { data: categories } = useCategories('expense');
  const key = `${period.year}-${period.month}`;
  return (
    <>
      <PageHeader title="Budget" subtitle={monthLabel(period.year, period.month)}
        actions={<PeriodPicker year={period.year} month={period.month} onChange={setPeriod} />} />
      <StateBoundary isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data ? <>
          <OverallBudgetPanel key={`overall-${key}`} period={data} />
          <CategoryBudgetsSection key={`categories-${key}`} period={data} categories={categories ?? []} />
        </> : null}
      </StateBoundary>
    </>
  );
}
