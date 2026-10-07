import { Meter } from '@/components/common/Meter';
import type { CurrencyCode, OverallBudgetUsage } from '@/types';
import { formatMoney, formatPercent } from '@/utils/money';

export function BudgetProgress({ budget, currency }: {
  budget: OverallBudgetUsage; currency: CurrencyCode;
}) {
  const percent = budget.overall_used_percent;
  const remaining = budget.overall_remaining_minor;
  const tone = (percent ?? 0) > 100 ? 'over' : (percent ?? 0) >= 85 ? 'near' : 'normal';
  const color = tone === 'over' ? 'var(--oi-negative)'
    : tone === 'near' ? 'var(--oi-warning-fill)' : 'var(--oi-primary)';
  return (
    <div className="oi-monthly-progress" data-budget-status={tone}>
      <div className="oi-line-head">
        <span className="oi-num">
          {formatMoney(budget.overall_actual_minor, currency)} spent of{' '}
          {formatMoney(budget.overall_limit_minor, currency)}
        </span>
        <span className={tone === 'over' ? 'oi-negative' : tone === 'near' ? 'oi-warning' : 'oi-muted'}>
          {formatPercent(percent)} used
        </span>
      </div>
      <Meter percent={percent} color={color} size="lg" label="Monthly budget used" />
      <div className="oi-line-foot">
        {remaining !== null && remaining < 0 ? (
          <span className="oi-negative">{formatMoney(Math.abs(remaining), currency)} over budget</span>
        ) : (
          <span className="oi-muted">{formatMoney(remaining, currency)} remaining</span>
        )}
        {tone === 'near' ? <span className="oi-warning">Approaching budget</span> : null}
      </div>
    </div>
  );
}
