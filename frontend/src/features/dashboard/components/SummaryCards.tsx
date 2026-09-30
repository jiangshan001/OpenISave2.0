import { ArrowDownOutlined, ArrowUpOutlined, FundOutlined, WalletOutlined } from '@ant-design/icons';
import { Col, Row } from 'antd';

import { StatCard } from '@/components/common/StatCard';
import type { Dashboard } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

/**
 * Headline figures. Net worth is the one elevated surface; income and
 * expense read as calm neutral numbers and carry their tone in the glyph, so
 * colour is reserved for the signed net cash flow.
 */
export function SummaryCards({ data }: { data: Dashboard }) {
  const base = data.base_currency;
  return (
    <Row gutter={[20, 20]}>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          accent
          label="Net worth"
          icon={<WalletOutlined />}
          amountMinor={data.net_worth_minor}
          currency={base}
          footer={
            <div className="oi-stat-split">
              <div>
                <span>Assets</span>
                <strong>{formatMoney(data.net_worth_assets_minor, base)}</strong>
              </div>
              <div>
                <span>Liabilities</span>
                <strong>{formatMoney(data.total_liabilities_minor, base)}</strong>
              </div>
            </div>
          }
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Income this month"
          icon={<ArrowDownOutlined />}
          iconTone="positive"
          amountMinor={data.month_income_minor}
          currency={base}
          footer="Transfers are excluded"
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Expenses this month"
          icon={<ArrowUpOutlined />}
          iconTone="negative"
          amountMinor={data.month_expense_minor}
          currency={base}
          footer="Transfers are excluded"
        />
      </Col>
      <Col xs={24} sm={12} xl={6}>
        <StatCard
          label="Net cash flow"
          icon={<FundOutlined />}
          iconTone="primary"
          amountMinor={data.net_cash_flow_minor}
          currency={base}
          tone="auto"
          footer={
            data.savings_rate_percent === null ? (
              'Savings rate needs income'
            ) : (
              <span>
                Savings rate{' '}
                <span
                  className={`oi-chip ${
                    data.savings_rate_percent >= 0 ? 'oi-chip--positive' : 'oi-chip--negative'
                  }`}
                >
                  {formatPercent(data.savings_rate_percent)}
                </span>
              </span>
            )
          }
        />
      </Col>
    </Row>
  );
}
