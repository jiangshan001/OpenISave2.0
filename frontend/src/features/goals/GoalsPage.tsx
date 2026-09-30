import { PlusOutlined } from '@ant-design/icons';
import { Button, Col, Row } from 'antd';
import { useMemo, useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useAccounts } from '@/hooks/useLedger';
import { useGoals } from '@/hooks/useResources';
import { resolveAccountTheme } from '@/theme/accountTheme';
import type { Goal } from '@/types';
import { GoalCard } from './components/GoalCard';
import { GoalFormModal } from './components/GoalFormModal';

export function GoalsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const { data, isLoading, error, refetch } = useGoals();
  const { data: accounts } = useAccounts(true);
  const accountThemes = useMemo(
    () => new Map((accounts ?? []).map((account) => [account.id, resolveAccountTheme(account)])),
    [accounts],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Savings goals"
        subtitle="Targets tracked against the accounts that already hold the money."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add goal
          </Button>
        }
      />

      <StateBoundary
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={(data ?? []).length === 0}
        emptyTitle="No savings goals yet"
        emptyDescription="Create a goal such as an emergency fund and link it to the account holding those savings."
        emptyAction={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Create your first goal
          </Button>
        }
      >
        <Row gutter={[20, 20]} align="top">
          {(data ?? []).map((goal) => (
            <Col key={goal.id} xs={24} sm={12} lg={8} xxl={6}>
              <GoalCard
                goal={goal}
                accountThemes={accountThemes}
                onEdit={(selected) => {
                  setEditing(selected);
                  setFormOpen(true);
                }}
              />
            </Col>
          ))}
        </Row>
      </StateBoundary>

      <GoalFormModal
        open={formOpen}
        goal={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </>
  );
}
