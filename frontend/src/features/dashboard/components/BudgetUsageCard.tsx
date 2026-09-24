import { Button, Card, Empty, Progress, Space } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { CurrencyCode } from '@/types';
import type { Dashboard, DashboardBudgetLine } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

const COLLAPSED_LINES = 6;

/** Presentation-only colour bands; the percentages themselves come from the backend. */
function usageColor(percent: number | null): string {
  if (percent === null || percent <= 85) return 'var(--oi-positive)';
  if (percent <= 100) return 'var(--oi-warning)';
  return 'var(--oi-negative)';
}

function RemainingText({ remaining, base }: { remaining: number; base: CurrencyCode }) {
  if (remaining < 0) {
    return (
      <span className="oi-negative">Over by {formatMoney(Math.abs(remaining), base)}</span>
    );
  }
  return <span className="oi-muted">Remaining: {formatMoney(remaining, base)}</span>;
}

function BudgetLineRow({ line, base }: { line: DashboardBudgetLine; base: CurrencyCode }) {
  return (
    <div data-testid="budget-line">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
        <span className="oi-strong">
          {line.category_name}
          {line.parent_name ? <span className="oi-muted"> · {line.parent_name}</span> : null}
        </span>
        <span style={{ color: usageColor(line.used_percent), fontWeight: 600 }}>
          {formatPercent(line.used_percent)}
        </span>
      </div>
      <Progress
        percent={Math.min(line.used_percent ?? 0, 100)}
        strokeColor={usageColor(line.used_percent)}
        showInfo={false}
        size="small"
        style={{ margin: '2px 0' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
        <span>
          {formatMoney(line.actual_minor, base)}{' '}
          <span className="oi-muted">/ {formatMoney(line.budget_minor, base)}</span>
        </span>
        <RemainingText remaining={line.remaining_minor} base={base} />
      </div>
    </div>
  );
}

/**
 * This month's budgets against live spending. Actuals, percentages and
 * remaining amounts are all computed by the backend from the ledger.
 */
export function BudgetUsageCard({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const { budget, base_currency: base } = data;
  const hasBudget = budget.lines.length > 0 && budget.total_budget_minor > 0;
  const lines = expanded ? budget.lines : budget.lines.slice(0, COLLAPSED_LINES);
  const hidden = budget.lines.length - lines.length;

  return (
    <Card
      title="Budget this month"
      variant="borderless"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/budget')}>
          {hasBudget ? 'Edit' : 'Set up'}
        </Button>
      }
    >
      {hasBudget ? (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="oi-money-lg">
                {formatMoney(budget.total_actual_minor, base)}{' '}
                <span className="oi-muted" style={{ fontSize: 14, fontWeight: 400 }}>
                  / {formatMoney(budget.total_budget_minor, base)}
                </span>
              </div>
              <span style={{ color: usageColor(budget.total_used_percent), fontWeight: 600 }}>
                {formatPercent(budget.total_used_percent)}
              </span>
            </div>
            <Progress
              percent={Math.min(budget.total_used_percent ?? 0, 100)}
              strokeColor={usageColor(budget.total_used_percent)}
              showInfo={false}
            />
            <RemainingText remaining={budget.total_remaining_minor} base={base} />
          </div>
          {lines.map((line) => (
            <BudgetLineRow key={line.category_id} line={line} base={base} />
          ))}
          {budget.lines.length > COLLAPSED_LINES ? (
            <Button type="link" size="small" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show fewer' : `Show all ${budget.lines.length} (${hidden} more)`}
            </Button>
          ) : null}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="oi-muted">No budget set for this month</span>}
        >
          <Button size="small" onClick={() => navigate('/budget')}>
            Create a budget
          </Button>
        </Empty>
      )}
    </Card>
  );
}
