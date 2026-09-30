import { ArrowDownOutlined, ArrowUpOutlined, FundOutlined, PercentageOutlined } from '@ant-design/icons';

import { StatCard, StatStrip } from '@/components/common/StatCard';
import type { Dashboard } from '@/types/dashboard';
import { formatPercent } from '@/utils/money';

/**
 * This month's flow as one flat strip beneath the net worth hero. Income and
 * expense read as calm neutral numbers with their direction in the glyph;
 * colour (plus the sign) is reserved for the signed net figures.
 */
export function SummaryCards({ data }: { data: Dashboard }) {
  const base = data.base_currency;
  const rate = data.savings_rate_percent;
  return (
    <StatStrip columns={4}>
      <StatCard
        label="Income this month"
        icon={<ArrowDownOutlined />}
        iconTone="positive"
        amountMinor={data.month_income_minor}
        currency={base}
        footer="Transfers are excluded"
      />
      <StatCard
        label="Expenses this month"
        icon={<ArrowUpOutlined />}
        iconTone="negative"
        amountMinor={data.month_expense_minor}
        currency={base}
        footer="Transfers are excluded"
      />
      <StatCard
        label="Net cash flow"
        icon={<FundOutlined />}
        iconTone="primary"
        amountMinor={data.net_cash_flow_minor}
        currency={base}
        tone="auto"
        footer="Income minus expenses"
      />
      <StatCard
        label="Savings rate"
        icon={<PercentageOutlined />}
        iconTone="primary"
        value={rate === null ? '-' : formatPercent(rate)}
        tone={rate === null ? 'neutral' : rate >= 0 ? 'positive' : 'negative'}
        footer={rate === null ? 'Needs income this month' : 'Share of income kept'}
      />
    </StatStrip>
  );
}
