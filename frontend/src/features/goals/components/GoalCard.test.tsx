import { afterEach, describe, expect, it } from 'vitest';

import { MilestoneProgress } from '@/components/common/MilestoneProgress';
import { resolveAccountTheme } from '@/theme/accountTheme';
import { makeAccount, makeGoal } from '@/test/fixtures';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import { GoalCard } from './GoalCard';

describe('MilestoneProgress', () => {
  it('exposes progress and the reached milestone in words, not only dot colour', () => {
    const { container } = renderWithProviders(
      <MilestoneProgress percent={37.1} label="Emergency Fund progress" showScale />,
    );
    const bar = screen.getByRole('progressbar', { name: 'Emergency Fund progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '37');
    expect(bar).toHaveAttribute('aria-valuetext', '37.1%, 25% milestone reached');
    const reached = [...container.querySelectorAll('[data-reached="true"]')].map((el) =>
      el.getAttribute('data-m'),
    );
    // One stop on the track and its label on the scale.
    expect(reached).toEqual(['25', '25']);
    for (const text of ['25%', '50%', '75%', '100%']) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('fills to the end and lights the star at 100% and beyond', () => {
    const { container } = renderWithProviders(<MilestoneProgress percent={107.3} label="Travel" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(container.querySelector('.oi-ms-star')).toHaveAttribute('data-reached', 'true');
    expect(container.querySelectorAll('.oi-ms-spark')).toHaveLength(0);
  });

  it('marks only a newly crossed milestone for its one-off moment', () => {
    const { container } = renderWithProviders(
      <MilestoneProgress percent={100} label="Travel" moment={100} />,
    );
    expect(container.querySelectorAll('[data-moment="true"]')).toHaveLength(1);
    expect(container.querySelectorAll('.oi-ms-spark').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('.oi-ms-spark').length).toBeLessThanOrEqual(5);
  });
});

describe('GoalCard', () => {
  afterEach(() => localStorage.clear());

  it('shows the goal identity, progress copy and the backend remaining figure', () => {
    const goal = makeGoal({ name: 'Emergency Fund', progress_percent: 52.5 });
    const { container } = renderWithProviders(<GoalCard goal={goal} onEdit={() => {}} />);
    expect(container.querySelector('.oi-goal-card')).toHaveAttribute('data-goal', 'emergency');
    expect(screen.getByText('Halfway there')).toBeInTheDocument();
    expect(screen.getByText(/313,500\.00 remaining/)).toBeInTheDocument();
    expect(screen.getByText('52.5%')).toBeInTheDocument();
  });

  it('says the goal is reached at 100%', () => {
    const goal = makeGoal({ name: 'Travel', progress_percent: 100, remaining_minor: 0 });
    renderWithProviders(<GoalCard goal={goal} onEdit={() => {}} />);
    expect(screen.getByText('Goal reached')).toBeInTheDocument();
    expect(screen.queryByText(/remaining/)).not.toBeInTheDocument();
  });

  it('shows each contributing account with its identity and share', async () => {
    const user = setupUser();
    const themes = new Map([
      [1, resolveAccountTheme(makeAccount({ id: 1, institution: '招商银行' }))],
      [2, resolveAccountTheme(makeAccount({ id: 2, name: 'HSBC Savings', institution: 'HSBC' }))],
    ]);
    const { container } = renderWithProviders(
      <GoalCard goal={makeGoal()} onEdit={() => {}} accountThemes={themes} />,
    );
    await user.click(screen.getByRole('button', { name: /show accounts/i }));
    const split = screen.getByRole('img', { name: /contribution split/i });
    expect(split).toHaveAccessibleName(
      'Contribution split: 招商银行 42.9%, HSBC Savings 57.1%',
    );
    expect([...split.children].map((segment) => segment.getAttribute('data-acct'))).toEqual([
      'cmb',
      'hsbc',
    ]);
    expect(container.querySelectorAll('.oi-contrib-row')).toHaveLength(2);
    expect(screen.getByText('shared')).toBeInTheDocument();
  });
});
