import { Button, Card, Space } from 'antd';
import { useState } from 'react';

import { MoneyInput } from '@/components/forms/MoneyInput';
import type { BudgetPeriod } from '@/types';
import { formatMoney } from '@/utils/money';
import { budgetInputMinor, budgetInputValue } from '../budgetMoney';
import { useSaveOverallBudget } from '../useSaveOverallBudget';
import { BudgetProgress } from './BudgetProgress';

export function OverallBudgetPanel({ period }: { period: BudgetPeriod }) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<string | null>(null);
  const save = useSaveOverallBudget(period.year, period.month, () => {
    setEditing(false);
    setAmount(null);
  });
  const hasBudget = period.overall_limit_minor !== null;
  const showForm = !hasBudget || editing;
  const minor = budgetInputMinor(amount, period.currency);

  const edit = () => {
    setAmount(budgetInputValue(period.overall_limit_minor!, period.currency));
    setEditing(true);
  };

  return (
    <Card variant="borderless" className="oi-monthly-budget">
      {showForm ? (
        <>
          <h2 className="oi-monthly-title">{hasBudget ? 'Edit monthly budget' : 'Set a monthly budget'}</h2>
          <p className="oi-muted">Decide how much you want to spend this month.</p>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (minor !== null && !save.isPending) save.mutate(minor);
          }}>
            <div className="oi-budget-input">
              <label htmlFor="overall-budget-amount">Monthly budget ({period.currency})</label>
              <MoneyInput id="overall-budget-amount" currency={period.currency} stringMode
                value={amount} onChange={setAmount} disabled={save.isPending} />
            </div>
            <Space wrap className="oi-mt-12">
              <Button type="primary" htmlType="submit" loading={save.isPending} disabled={minor === null}>
                {hasBudget ? 'Save budget' : 'Set budget'}
              </Button>
              {hasBudget ? <>
                <Button disabled={save.isPending} onClick={() => setEditing(false)}>Cancel</Button>
                <Button danger disabled={save.isPending} onClick={() => save.mutate(null)}>
                  Clear monthly budget
                </Button>
              </> : null}
            </Space>
          </form>
        </>
      ) : (
        <>
          <div className="oi-line-head">
            <h2 className="oi-monthly-title">Monthly Budget</h2>
            <Button onClick={edit}>Edit budget</Button>
          </div>
          <div className="oi-money-xl oi-mt-12">{formatMoney(period.overall_limit_minor, period.currency)}</div>
          <dl className="oi-budget-facts">
            <div><dt>Spent</dt><dd>{formatMoney(period.overall_actual_minor, period.currency)}</dd></div>
            <div>
              <dt>{(period.overall_remaining_minor ?? 0) < 0 ? 'Over budget' : 'Remaining'}</dt>
              <dd className={(period.overall_remaining_minor ?? 0) < 0 ? 'oi-negative' : ''}>
                {formatMoney(period.overall_remaining_minor === null ? null
                  : Math.abs(period.overall_remaining_minor), period.currency)}
              </dd>
            </div>
          </dl>
          <BudgetProgress budget={period} currency={period.currency} />
        </>
      )}
    </Card>
  );
}
