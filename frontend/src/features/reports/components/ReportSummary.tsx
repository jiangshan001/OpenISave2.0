import { Col, Row } from 'antd';

import { StatCard } from '@/components/common/StatCard';
import type { MonthlyReport } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

export function ReportSummary({ report }: { report: MonthlyReport }) {
  const base = report.base_currency;
  const { summary } = report;

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} sm={12} xl={6}>
        <StatCard label="Income" amountMinor={summary.income_minor} currency={base} tone="positive" />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Expenses"
          amountMinor={summary.expense_minor}
          currency={base}
          tone="negative"
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Net cash flow"
          amountMinor={summary.net_cash_flow_minor}
          currency={base}
          tone="auto"
          footer={
            summary.savings_rate_percent === null
              ? 'No income this month'
              : `Savings rate ${formatPercent(summary.savings_rate_percent)}`
          }
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Net worth today"
          amountMinor={summary.net_worth_minor}
          currency={base}
          hint="Current balances converted at the latest exchange rate, not the rate for this month."
          footer={`Assets ${formatMoney(summary.total_assets_minor, base)}`}
        />
      </Col>
    </Row>
  );
}
