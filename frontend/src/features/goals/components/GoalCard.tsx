import { DeleteOutlined, DownOutlined, EditOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Progress, Space, Tag, Tooltip } from 'antd';
import { useState } from 'react';

import { useDeleteGoal } from '@/hooks/useResources';
import type { Goal } from '@/types';
import { formatDate } from '@/utils/dates';
import { formatMoney, formatPercent } from '@/utils/money';
import { GoalContributions } from './GoalContributions';

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
}

export function GoalCard({ goal, onEdit }: GoalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const remove = useDeleteGoal();
  const hasTarget = goal.target_amount_minor !== null;
  const percent = goal.progress_percent ?? 0;

  return (
    <Card className="oi-account-card" variant="borderless">
      <div className="oi-card-title-row">
        <Space direction="vertical" size={2}>
          <span className="oi-strong">{goal.name}</span>
          <Space size={6} wrap>
            <Tag bordered={false}>
              {goal.account_count} account{goal.account_count === 1 ? '' : 's'}
            </Tag>
            {goal.selection_mode === 'all_eligible' ? (
              <Tooltip title="Follows every eligible account automatically">
                <Tag color="geekblue" bordered={false}>
                  auto
                </Tag>
              </Tooltip>
            ) : null}
            {goal.account_count === 0 ? (
              <Tooltip title="Link an account so progress can be tracked">
                <Tag color="orange">No accounts</Tag>
              </Tooltip>
            ) : null}
          </Space>
        </Space>
        <Tag bordered={false}>{goal.currency}</Tag>
      </div>

      <div className="oi-goal-balance">
        <span className="oi-money-lg">{formatMoney(goal.current_amount_minor, goal.currency)}</span>
        {hasTarget ? (
          <span className="oi-muted">
            {' '}
            of {formatMoney(goal.target_amount_minor, goal.currency)}
          </span>
        ) : null}
      </div>

      {hasTarget ? (
        <>
          <Progress
            percent={Math.min(percent, 100)}
            status={percent >= 100 ? 'success' : 'active'}
            format={() => formatPercent(goal.progress_percent)}
          />
          <div className="oi-muted oi-small oi-mt-4">
            {formatMoney(goal.remaining_minor, goal.currency)} to go
            {goal.deadline ? ` · by ${formatDate(goal.deadline)}` : ''}
          </div>
        </>
      ) : (
        <div className="oi-muted oi-small">
          Accumulating · no target set
        </div>
      )}

      {goal.unconverted_accounts.length > 0 ? (
        <Tag color="red" className="oi-tag-below">
          No rate for {goal.unconverted_accounts.join(', ')}
        </Tag>
      ) : null}

      <Space size={4} className="oi-mt-14" wrap>
        <Button
          size="small"
          type="text"
          icon={expanded ? <UpOutlined /> : <DownOutlined />}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide accounts' : 'Show accounts'}
        </Button>
        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => onEdit(goal)}>
          Edit
        </Button>
        <Popconfirm
          title="Remove this goal?"
          description="The linked accounts and their balances are not affected."
          okText="Remove"
          onConfirm={() => remove.mutate(goal.id)}
        >
          <Button size="small" type="text" danger icon={<DeleteOutlined />}>
            Remove
          </Button>
        </Popconfirm>
      </Space>

      {expanded ? (
        <div className="oi-mt-12">
          <GoalContributions
            contributions={goal.contributions}
            goalCurrency={goal.currency}
            total={goal.current_amount_minor}
          />
        </div>
      ) : null}
    </Card>
  );
}
