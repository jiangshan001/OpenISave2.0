import { FlagOutlined } from '@ant-design/icons';
import { Button, Card } from 'antd';
import { useNavigate } from 'react-router-dom';

import { EmptyState } from '@/components/common/EmptyState';
import { Meter } from '@/components/common/Meter';
import type { Dashboard } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

export function GoalsSummaryCard({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
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
        <div className="oi-budget-lines" style={{ paddingTop: 0, gap: 18 }}>
          {data.goals.slice(0, 5).map((goal) => (
            <div key={goal.id}>
              <div className="oi-line-head">
                <span className="oi-strong">{goal.name}</span>
                {goal.target_amount_minor ? (
                  <span className="oi-chip oi-chip--primary">
                    {formatPercent(goal.progress_percent)}
                  </span>
                ) : null}
              </div>
              {goal.target_amount_minor ? (
                <Meter
                  percent={goal.progress_percent}
                  color="var(--oi-primary)"
                  label={goal.name}
                />
              ) : (
                <div style={{ height: 8 }} />
              )}
              <div className="oi-line-foot">
                <span>
                  {formatMoney(goal.current_amount_minor, goal.currency)}
                  {goal.target_amount_minor ? (
                    <span className="oi-muted">
                      {' '}
                      / {formatMoney(goal.target_amount_minor, goal.currency)}
                    </span>
                  ) : null}
                </span>
                {goal.target_amount_minor ? null : (
                  <span className="oi-muted">Accumulating · no target set</span>
                )}
              </div>
            </div>
          ))}
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
