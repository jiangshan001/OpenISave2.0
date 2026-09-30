import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Row, Space, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { MoneyText } from '@/components/common/MoneyText';
import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useAccount, useAccountPurposes, useAccountTransactions, useAccounts } from '@/hooks/useLedger';
import { useCategories } from '@/hooks/useResources';
import { formatDate } from '@/utils/dates';
import { ACCOUNT_TYPE_LABELS } from '@/utils/labels';
import { formatMoney } from '@/utils/money';
import { TransactionTable } from '../transactions/components/TransactionTable';
import { AccountFormModal } from './components/AccountFormModal';

export function AccountDetailPage() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const id = Number(accountId);
  const [editOpen, setEditOpen] = useState(false);

  const { data: account, isLoading, error, refetch } = useAccount(id);
  const { data: transactions, isLoading: loadingTransactions } = useAccountTransactions(id);
  const { data: allAccounts } = useAccounts(true);
  // Include archived categories so historical rows keep their names.
  const { data: categories } = useCategories(undefined, true);
  const { data: purposes } = useAccountPurposes();

  const purposeLabel = purposes?.find((item) => item.value === account?.purpose)?.label;

  return (
    <>
      <PageHeader
        title={account?.name ?? 'Account'}
        subtitle={account?.institution ?? undefined}
        actions={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/accounts')}>
              All accounts
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              disabled={!account}
              onClick={() => setEditOpen(true)}
            >
              Edit account
            </Button>
          </Space>
        }
      />

      <StateBoundary isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {account ? (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={10}>
                <Card className="oi-stat-card" variant="borderless">
                  <div className="oi-stat-label">Current balance</div>
                  <MoneyText
                    amountMinor={account.balance_minor}
                    currency={account.currency}
                    baseAmountMinor={account.base_balance_minor}
                    baseCurrency={account.base_currency}
                    size="xl"
                    tone={account.is_liability ? 'negative' : 'neutral'}
                  />
                  <div className="oi-stat-footer">
                    Opening balance{' '}
                    {formatMoney(account.opening_balance_minor, account.currency)}
                  </div>
                </Card>
              </Col>
              <Col xs={24} lg={14}>
                <Card variant="borderless" className="oi-card-fill">
                  <Descriptions size="small" column={2} colon={false}>
                    <Descriptions.Item label="Type">
                      {ACCOUNT_TYPE_LABELS[account.account_type]}
                    </Descriptions.Item>
                    <Descriptions.Item label="Currency">{account.currency}</Descriptions.Item>
                    <Descriptions.Item label="Purpose">{purposeLabel ?? '—'}</Descriptions.Item>
                    <Descriptions.Item label="Net worth">
                      {account.include_in_net_worth ? (
                        <Tag color="blue">Included</Tag>
                      ) : (
                        <Tag color="orange">Excluded</Tag>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="Status">
                      {account.is_archived ? <Tag>Archived</Tag> : <Tag color="green">Active</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="Created">
                      {formatDate(account.created_at)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Note" span={2}>
                      {account.note ?? '—'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
            </Row>

            <Card
              title="Transaction history"
              variant="borderless"
              className="oi-section-gap"
              styles={{ body: { paddingTop: 0 } }}
            >
              <TransactionTable
                rows={transactions ?? []}
                accounts={allAccounts ?? []}
                categories={categories ?? []}
                loading={loadingTransactions}
              />
            </Card>

            <AccountFormModal
              open={editOpen}
              account={account}
              onClose={() => setEditOpen(false)}
            />
          </>
        ) : null}
      </StateBoundary>
    </>
  );
}
