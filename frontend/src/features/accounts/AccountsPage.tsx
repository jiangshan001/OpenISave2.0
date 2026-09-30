import { PlusOutlined } from '@ant-design/icons';
import { Button, Col, Row, Switch, Space } from 'antd';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useAccountPurposes, useAccounts } from '@/hooks/useLedger';
import type { AccountBalance } from '@/types';
import { AccountCard } from './components/AccountCard';
import { AccountFormModal } from './components/AccountFormModal';
import { AccountGroupSummary } from './components/AccountGroupSummary';

export function AccountsPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [editing, setEditing] = useState<AccountBalance | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading, error, refetch } = useAccounts(includeArchived);
  const { data: purposes } = useAccountPurposes();

  const purposeLabels = useMemo(() => {
    const map = new Map<string, string>();
    purposes?.forEach((item) => map.set(item.value, item.label));
    return map;
  }, [purposes]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (account: AccountBalance) => {
    setEditing(account);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="Every place your money sits, in its own currency."
        actions={
          <Space>
            <Space size={6}>
              <Switch
                size="small"
                checked={includeArchived}
                onChange={setIncludeArchived}
                id="show-archived"
              />
              <label htmlFor="show-archived" className="oi-muted">
                Show archived
              </label>
            </Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add account
            </Button>
          </Space>
        }
      />

      <StateBoundary
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={(data ?? []).length === 0}
        emptyTitle="No accounts yet"
        emptyDescription="Add your first bank account to start tracking balances and transactions."
        emptyAction={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add your first account
          </Button>
        }
      >
        <AccountGroupSummary accounts={data ?? []} />
        <Row gutter={[20, 20]}>
          {(data ?? []).map((account) => (
            <Col key={account.id} xs={24} sm={12} lg={8} xxl={6}>
              <AccountCard
                account={account}
                purposeLabel={account.purpose ? purposeLabels.get(account.purpose) : undefined}
                onEdit={openEdit}
              />
            </Col>
          ))}
        </Row>
      </StateBoundary>

      <AccountFormModal
        open={formOpen}
        account={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}
