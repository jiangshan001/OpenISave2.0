import {
  CheckCircleFilled,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { Button, Card, Popconfirm, Space, Tag, Tooltip } from 'antd';
import { useState } from 'react';

import { GoalGlyph } from '@/components/common/GoalGlyph';
import { MilestoneProgress } from '@/components/common/MilestoneProgress';
import { useDeleteGoal } from '@/hooks/useResources';
import type { AccountTheme } from '@/theme/accountTheme';
import { goalEncouragement, resolveGoalTheme } from '@/theme/goalTheme';
import { useMilestoneMoment } from '@/theme/milestoneMemory';
import type { Goal } from '@/types';
import { formatDate } from '@/utils/dates';
import { formatMoney, formatPercent } from '@/utils/money';
import { GoalContributions } from './GoalContributions';

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  /** Account themes by id, so contributions carry each account's identity. */
  accountThemes?: Map<number, AccountTheme>;
}

export function GoalCard({ goal, onEdit, accountThemes }: GoalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const remove = useDeleteGoal();
  const theme = resolveGoalTheme(goal.name);
  const hasTarget = goal.target_amount_minor !== null;
  const percent = goal.progress_percent;
  const complete = hasTarget && (percent ?? 0) >= 100;
  const moment = useMilestoneMoment(goal.id, hasTarget ? percent : null);

  return (
    <Card
      className="oi-goal-card"
      variant="borderless"
      data-goal={theme.kind}
      data-complete={complete}
    >
      <div className="oi-card-title-row">
        <div className="oi-goal-head">
          <GoalGlyph kind={theme.kind} />
          <div>
            <div className="oi-goal-name">{goal.name}</div>
            <div className="oi-goal-meta">
              <span>
                {goal.account_count} account{goal.account_count === 1 ? '' : 's'}
              </span>
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
            </div>
          </div>
        </div>
        <span className="oi-chip oi-chip--quiet">{goal.currency}</span>
      </div>

      <div className="oi-goal-figures">
        <span>
          <span className="oi-money-lg">{formatMoney(goal.current_amount_minor, goal.currency)}</span>
          {hasTarget ? (
            <span className="oi-money-of">
              {' '}
              of {formatMoney(goal.target_amount_minor, goal.currency)}
            </span>
          ) : null}
        </span>
        {hasTarget ? <span className="oi-goal-pct">{formatPercent(percent)}</span> : null}
      </div>

      {hasTarget ? (
        <>
          <MilestoneProgress
            percent={percent}
            label={`${goal.name} progress`}
            showScale
            moment={moment}
          />
          <div className="oi-goal-foot">
            <span className="oi-goal-copy" data-complete={complete}>
              {complete ? <CheckCircleFilled /> : null}
              {goalEncouragement(percent)}
            </span>
            <span>
              {complete ? null : `${formatMoney(goal.remaining_minor, goal.currency)} remaining`}
              {!complete && goal.deadline ? ' · ' : null}
              {goal.deadline ? `by ${formatDate(goal.deadline)}` : null}
            </span>
          </div>
        </>
      ) : (
        <div className="oi-goal-foot">Accumulating · no target set</div>
      )}

      {goal.unconverted_accounts.length > 0 ? (
        <Tag color="red" className="oi-tag-below">
          No rate for {goal.unconverted_accounts.join(', ')}
        </Tag>
      ) : null}

      <Space size={2} wrap className="oi-account-actions">
        <Button
          size="small"
          type="text"
          icon={expanded ? <UpOutlined /> : <DownOutlined />}
          aria-expanded={expanded}
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
        <GoalContributions
          contributions={goal.contributions}
          goalCurrency={goal.currency}
          total={goal.current_amount_minor}
          accountThemes={accountThemes}
        />
      ) : null}
    </Card>
  );
}
