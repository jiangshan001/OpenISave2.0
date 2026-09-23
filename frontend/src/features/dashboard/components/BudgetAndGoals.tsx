import { Button, Card, Empty, Progress, Space } from 'antd';
import { useNavigate } from 'react-router-dom';

import type { Dashboard } from '@/types/dashboard';
import { formatMoney, formatPercent } from '@/utils/money';

function progressStatus(percent: number | null): 'normal' | 'exception' | 'success' {
  if (percent === null) return 'normal';
  if (percent > 100) return 'exception';
  if (percent > 85) return 'normal';
  return 'success';
}

export function BudgetSummaryCard({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  const { budget, base_currency: base } = data;
  const hasBudget = budget.total_budget_minor > 0;
  const percent = hasBudget ? (budget.total_actual_minor / budget.total_budget_minor) * 100 : null;

  return (
    <Card
      title="Budget this month"
      variant="borderless"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/budget')}>
          {hasBudget ? 'Edit' : 'Set up'}
        </Button>
      }
    >
      {hasBudget ? (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          <div>
            <div className="oi-money-lg">
              {formatMoney(budget.total_actual_minor, base)}{' '}
              <span className="oi-muted" style={{ fontSize: 14, fontWeight: 400 }}>
                of {formatMoney(budget.total_budget_minor, base)}
              </span>
            </div>
            <Progress
              percent={Math.min(percent ?? 0, 100)}
              status={progressStatus(percent)}
              format={() => formatPercent(percent)}
            />
          </div>
          {budget.lines.map((line) => (
            <div key={line.category_id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{line.category_name}</span>
                <span className="oi-muted">
                  {formatMoney(line.actual_minor, base)} / {formatMoney(line.budget_minor, base)}
                </span>
              </div>
              <Progress
                percent={Math.min(line.used_percent ?? 0, 100)}
                status={progressStatus(line.used_percent)}
                showInfo={false}
                size="small"
              />
            </div>
          ))}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="oi-muted">No budget set for this month</span>}
        >
          <Button size="small" onClick={() => navigate('/budget')}>
            Create a budget
          </Button>
        </Empty>
      )}
    </Card>
  );
}

export function GoalsSummaryCard({ data }: { data: Dashboard }) {
  const navigate = useNavigate();
  return (
    <Card
      title="Savings goals"
      variant="borderless"
      extra={
        <Button type="link" size="small" onClick={() => navigate('/goals')}>
          {data.goals.length > 0 ? 'View all' : 'Add goal'}
        </Button>
      }
    >
      {data.goals.length > 0 ? (
        <Space direction="vertical" size={14} style={{ width: '100%' }}>
          {data.goals.slice(0, 5).map((goal) => (
            <div key={goal.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span className="oi-strong">{goal.name}</span>
                <span className="oi-muted">
                  {formatMoney(goal.current_amount_minor, goal.currency)}
                  {goal.target_amount_minor
                    ? ` / ${formatMoney(goal.target_amount_minor, goal.currency)}`
                    : ''}
                </span>
              </div>
              {goal.target_amount_minor ? (
                <Progress
                  percent={Math.min(goal.progress_percent ?? 0, 100)}
                  size="small"
                  format={() => formatPercent(goal.progress_percent)}
                />
              ) : (
                <span className="oi-muted" style={{ fontSize: 12 }}>
                  Accumulating · no target set
                </span>
              )}
            </div>
          ))}
        </Space>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span className="oi-muted">No savings goals yet</span>}
        >
          <Button size="small" onClick={() => navigate('/goals')}>
            Create a goal
          </Button>
        </Empty>
      )}
    </Card>
  );
}
