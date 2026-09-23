import { PlusOutlined } from '@ant-design/icons';
import { Button, Col, Row } from 'antd';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useGoals } from '@/hooks/useResources';
import type { Goal } from '@/types';
import { GoalCard } from './components/GoalCard';
import { GoalFormModal } from './components/GoalFormModal';

export function GoalsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const { data, isLoading, error, refetch } = useGoals();

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
        <Row gutter={[16, 16]}>
          {(data ?? []).map((goal) => (
            <Col key={goal.id} xs={24} sm={12} lg={8} xxl={6}>
              <GoalCard
                goal={goal}
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
