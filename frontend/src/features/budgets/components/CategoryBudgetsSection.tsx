import { Button, Card, Space, Table } from 'antd';
import { useState } from 'react';

import { Meter } from '@/components/common/Meter';
import type { BudgetLine, BudgetPeriod, Category } from '@/types';
import { formatMoney, formatPercent } from '@/utils/money';
import { BudgetEditor } from './BudgetEditor';

export function CategoryBudgetsSection({ period, categories }: {
  period: BudgetPeriod; categories: Category[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const count = period.lines.length;
  return (
    <section className="oi-category-budgets oi-section-gap" aria-label="Category Budgets">
      <div className="oi-line-head">
        <h2 className="oi-monthly-title">Category Budgets <span className="oi-meta">Optional</span></h2>
        {count > 0 ? <span className="oi-muted">{count} category budget{count === 1 ? '' : 's'}</span> : null}
      </div>
      <p className="oi-muted">Control specific areas of spending.</p>
      <Button aria-expanded={expanded} aria-controls="category-budget-details"
        onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Hide category budgets' : count > 0 ? 'Manage categories' : 'Show category budgets'}
      </Button>
      {expanded ? (
        <Card id="category-budget-details" variant="borderless" className="oi-mt-12">
          <p className="oi-muted">
            Category limits are independent guardrails. They do not need to add up to your monthly budget.
            Parent categories include their subcategories; overlapping limits are tracked independently.
          </p>
          <Table<BudgetLine> rowKey="category_id" pagination={false} dataSource={period.lines}
            scroll={{ x: 680 }} locale={{ emptyText: 'No category budgets yet' }} columns={[
              { title: 'Category', render: (_, row) => <Space direction="vertical" size={0}>
                <span className="oi-strong">{row.category_name}</span>
                {row.parent_name ? <span className="oi-meta">in {row.parent_name}</span> : null}
              </Space> },
              { title: 'Limit', align: 'right', render: (_, row) => formatMoney(row.budget_minor, period.currency) },
              { title: 'Spent', align: 'right', render: (_, row) => formatMoney(row.actual_minor, period.currency) },
              { title: 'Remaining', align: 'right', render: (_, row) => <span className={row.remaining_minor < 0 ? 'oi-negative' : ''}>
                {row.remaining_minor < 0 ? `${formatMoney(Math.abs(row.remaining_minor), period.currency)} over budget`
                  : formatMoney(row.remaining_minor, period.currency)}
              </span> },
              { title: 'Used', width: 160, render: (_, row) => <>
                <Meter percent={row.used_percent} label={`${row.category_name} budget used`}
                  color={(row.used_percent ?? 0) > 100 ? 'var(--oi-negative)' : 'var(--oi-primary)'} />
                <span className="oi-meta">{formatPercent(row.used_percent)}</span>
              </> },
            ]} />
          <Button className="oi-mt-12" onClick={() => setEditorOpen(true)}>
            {count > 0 ? 'Edit category budgets' : 'Add category budget'}
          </Button>
        </Card>
      ) : null}
      <BudgetEditor open={editorOpen} period={period} categories={categories}
        onClose={() => setEditorOpen(false)} />
    </section>
  );
}
