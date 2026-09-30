import { FlagOutlined } from '@ant-design/icons';
import { Button, Card } from 'antd';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { GoalGlyph } from '@/components/common/GoalGlyph';
import { MilestoneProgress } from '@/components/common/MilestoneProgress';
import { useGoals } from '@/hooks/useResources';
import { goalEncouragement, resolveGoalTheme } from '@/theme/goalTheme';
import type { Dashboard } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

/**
 * Overview digest: each goal's progress, percentage and what is left. The
 * remaining amount comes from the goals endpoint (the dashboard payload does
 * not carry it); until it arrives the line shows current of target instead.
 */
export function GoalsSummaryCard({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  const { data: goals } = useGoals();
  const remaining = new Map((goals ?? []).map((goal) => [goal.id, goal.remaining_minor]));
  return (
    <Card
      title="Savings goals"
      variant="borderless"
      className="oi-card-fill"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/goals')}>
          {data.goals.length > 0 ? 'View all' : 'Add goal'}
        </Button>
      }
    >
      {data.goals.length > 0 ? (
        <div className="oi-goal-lines">
          {data.goals.slice(0, 5).map((goal) => {
            const { kind } = resolveGoalTheme(goal.name);
            const hasTarget = Boolean(goal.target_amount_minor);
            const complete = hasTarget && (goal.progress_percent ?? 0) >= 100;
            return (
              <div key={goal.id} className="oi-goal-line" data-goal={kind}>
                <div className="oi-line-head">
                  <span className="oi-goal-line-name">
                    <GoalGlyph kind={kind} size="sm" />
                    {goal.name}
                  </span>
                  {hasTarget ? (
                    <span className="oi-goal-pct">{formatPercent(goal.progress_percent)}</span>
                  ) : null}
                </div>
                {hasTarget ? (
                  <MilestoneProgress
                    percent={goal.progress_percent}
                    label={`${goal.name} progress`}
                    size="sm"
                  />
                ) : null}
                <div className="oi-line-foot">
                  {hasTarget ? (
                    <>
                      <span>
                        {complete
                          ? 'Target met'
                          : remaining.get(goal.id) != null
                            ? `${formatMoney(remaining.get(goal.id), goal.currency)} remaining`
                            : `${formatMoney(goal.current_amount_minor, goal.currency)} of ${formatMoney(goal.target_amount_minor, goal.currency)}`}
                      </span>
                      <span>{goalEncouragement(goal.progress_percent)}</span>
                    </>
                  ) : (
                    <span>
                      {formatMoney(goal.current_amount_minor, goal.currency)} · no target set
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<FlagOutlined />}
          title="No savings goals yet"
          text="Link a goal to one or more accounts to track progress automatically."
          action={
            <Button size="small" onClick={() => navigate('/goals')}>
              Create a goal
            </Button>
          }
        />
      )}
    </Card>
  );
}
