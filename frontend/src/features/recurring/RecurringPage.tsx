import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Segmented } from 'antd';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useAccounts } from '@/hooks/useLedger';
import { useRecurringRules, useUpcoming } from '@/hooks/useRecurring';
import { useCategories } from '@/hooks/useResources';
import type { RecurringRule } from '@/types/recurring';
import { RecurringFormModal } from './components/RecurringFormModal';
import { RecurringTable } from './components/RecurringTable';
import { UpcomingList } from './components/UpcomingList';

export function RecurringPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRule | null>(null);

  const rules = useRecurringRules(showArchived);
  const upcoming = useUpcoming(30);
  const { data: accounts } = useAccounts(true);
  const { data: categories } = useCategories(undefined, true);

  const hasAccounts = (accounts ?? []).some((account) => !account.is_archived);
  const visible = (rules.data ?? []).filter(
    (rule) => showArchived || rule.status !== 'archived',
  );
  const dueItems = (upcoming.data ?? []).filter((item) => item.is_due);
  const soonItems = (upcoming.data ?? []).filter((item) => !item.is_due).slice(0, 6);

  return (
    <>
      <PageHeader
        title="Recurring Transactions"
        subtitle="Salary, rent, bills and subscriptions on a schedule. Nothing is recorded until it falls due."
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!hasAccounts}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New recurring
          </Button>
        }
      />

      {dueItems.length > 0 ? (
        <Card
          title={`Due now · ${dueItems.length}`}
          variant="borderless"
          className="oi-section-gap"
          style={{ marginTop: 0, marginBottom: 20 }}
        >
          <UpcomingList items={dueItems} />
        </Card>
      ) : null}

      <Card
        variant="borderless"
        styles={{ body: { padding: 0 } }}
        title="Schedules"
        extra={
          <Segmented
            size="small"
            value={showArchived ? 'all' : 'current'}
            onChange={(value) => setShowArchived(value === 'all')}
            options={[
              { value: 'current', label: 'Current' },
              { value: 'all', label: 'Include archived' },
            ]}
          />
        }
      >
        <StateBoundary
          isLoading={rules.isLoading}
          error={rules.error}
          onRetry={() => void rules.refetch()}
          isEmpty={!hasAccounts}
          emptyTitle="Add an account first"
          emptyDescription="A recurring transaction is recorded against one of your accounts."
        >
          <RecurringTable
            rules={visible}
            accounts={accounts ?? []}
            categories={categories ?? []}
            loading={rules.isFetching}
            onEdit={(rule) => {
              setEditing(rule);
              setFormOpen(true);
            }}
          />
        </StateBoundary>
      </Card>

      {soonItems.length > 0 ? (
        <Card title="Coming up · next 30 days" variant="borderless" className="oi-section-gap">
          <UpcomingList items={soonItems} actions={false} />
        </Card>
      ) : null}

      <RecurringFormModal
        open={formOpen}
        rule={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}
