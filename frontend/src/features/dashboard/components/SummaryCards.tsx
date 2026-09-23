import { Col, Row } from 'antd';

import { StatCard } from '@/components/common/StatCard';
import type { Dashboard } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

export function SummaryCards({ data }: { data: Dashboard }) {
  const base = data.base_currency;
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          accent
          label="Net worth"
          amountMinor={data.net_worth_minor}
          currency={base}
          footer={`Assets ${formatMoney(data.total_assets_minor, base)} · Liabilities ${formatMoney(
            data.total_liabilities_minor,
            base,
          )}`}
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Income this month"
          amountMinor={data.month_income_minor}
          currency={base}
          tone="positive"
          footer="Transfers are excluded"
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Expenses this month"
          amountMinor={data.month_expense_minor}
          currency={base}
          tone="negative"
          footer="Transfers are excluded"
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Net cash flow"
          amountMinor={data.net_cash_flow_minor}
          currency={base}
          tone="auto"
          footer={
            data.savings_rate_percent === null
              ? 'Savings rate needs income'
              : `Savings rate ${formatPercent(data.savings_rate_percent)}`
          }
        />
      </Col>
    </Row>
  );
}
