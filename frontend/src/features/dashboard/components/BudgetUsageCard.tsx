import { PieChartOutlined } from '@ant-design/icons';
import { Button, Card } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { Meter } from '@/components/common/Meter';
import type { CurrencyCode } from '@/types';
import type { Dashboard, DashboardBudgetLine } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

const COLLAPSED_LINES = 6;

type Band = 'ok' | 'near' | 'over';

/** Presentation-only colour bands; the percentages themselves come from the backend. */
function band(percent: number | null): Band {
  if (percent === null || percent <= 85) return 'ok';
  if (percent <= 100) return 'near';
  return 'over';
}

const BAR_COLOR: Record<Band, string> = {
  ok: 'var(--oi-primary)',
  near: 'var(--oi-warning)',
  over: 'var(--oi-negative)',
};

const CHIP_CLASS: Record<Band, string> = {
  ok: 'oi-chip',
  near: 'oi-chip oi-chip--warning',
  over: 'oi-chip oi-chip--negative',
};

function RemainingText({ remaining, base }: { remaining: number; base: CurrencyCode }) {
  if (remaining < 0) {
    return (
      <span className="oi-negative">Over by {formatMoney(Math.abs(remaining), base)}</span>
    );
  }
  return <span className="oi-muted">Remaining: {formatMoney(remaining, base)}</span>;
}

function BudgetLineRow({ line, base }: { line: DashboardBudgetLine; base: CurrencyCode }) {
  const tone = band(line.used_percent);
  return (
    <div data-testid="budget-line">
      <div className="oi-line-head">
        <span className="oi-strong">
          {line.category_name}
          {line.parent_name ? <span className="oi-muted"> · {line.parent_name}</span> : null}
        </span>
        <span className={CHIP_CLASS[tone]}>{formatPercent(line.used_percent)}</span>
      </div>
      <Meter percent={line.used_percent} color={BAR_COLOR[tone]} label={line.category_name} />
      <div className="oi-line-foot">
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
  const totalTone = band(budget.total_used_percent);

  return (
    <Card
      title="Budget this month"
      variant="borderless"
      className="oi-card-fill"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/budget')}>
          {hasBudget ? 'Edit' : 'Set up'}
        </Button>
      }
    >
      {hasBudget ? (
        <>
          <div className="oi-budget-total">
            <div className="oi-line-head">
              <div className="oi-money-lg">
                {formatMoney(budget.total_actual_minor, base)}{' '}
                <span className="oi-muted" style={{ fontSize: 14, fontWeight: 400 }}>
                  of {formatMoney(budget.total_budget_minor, base)}
                </span>
              </div>
              <span className={CHIP_CLASS[totalTone]}>
                {formatPercent(budget.total_used_percent)}
              </span>
            </div>
            <Meter
              percent={budget.total_used_percent}
              color={BAR_COLOR[totalTone]}
              size="lg"
              label="Total budget used"
            />
            <div className="oi-line-foot">
              <RemainingText remaining={budget.total_remaining_minor} base={base} />
            </div>
          </div>
          <div className="oi-budget-lines">
            {lines.map((line) => (
              <BudgetLineRow key={line.category_id} line={line} base={base} />
            ))}
            {budget.lines.length > COLLAPSED_LINES ? (
              <Button
                type="link"
                size="small"
                style={{ alignSelf: 'flex-start', paddingInline: 0 }}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'Show fewer' : `Show all ${budget.lines.length} (${hidden} more)`}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <EmptyState
          icon={<PieChartOutlined />}
          title="No budget set for this month"
          text="Give each spending category a monthly limit to see how the month is tracking."
          action={
            <Button size="small" onClick={() => navigate('/budget')}>
              Create a budget
            </Button>
          }
        />
      )}
    </Card>
  );
}
