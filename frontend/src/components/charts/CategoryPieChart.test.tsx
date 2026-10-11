import { cloneElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen, setupUser, within } from '@/test/utils';
import type { CategoryBreakdown } from '@/types/dashboard';
import { CategoryPieChart } from './CategoryPieChart';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return { ...actual, ResponsiveContainer: ({ children }: { children: ReactElement }) =>
    cloneElement(children, { width: 220, height: 220 }) };
});

const DATA: CategoryBreakdown[] = [
  { category_id: 1, category_name: 'Transport', parent_name: null, amount_minor: 7500, children: [
    { category_id: 2, category_name: 'Taxi', parent_name: 'Transport', amount_minor: 2500, children: [] },
    { category_id: 3, category_name: 'Public Transport', parent_name: 'Transport', amount_minor: 5000, children: [] },
  ] },
  { category_id: 4, category_name: 'Food', parent_name: null, amount_minor: 2500, children: [] },
];

describe('CategoryPieChart hierarchy', () => {
  it('shows parent totals, drills into child shares, and returns to the overview', async () => {
    const user = setupUser();
    const { container } = renderWithProviders(<CategoryPieChart data={DATA} currency="CNY" />);
    const transport = screen.getByRole('button', { name: 'View Transport breakdown' });
    expect(within(transport).getByText('75.0%')).toBeInTheDocument();
    expect(screen.queryByText('Taxi')).not.toBeInTheDocument();
    await user.click(transport);
    expect(screen.getByText('Taxi')).toBeInTheDocument();
    expect(screen.getByText('Public Transport')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toBeInTheDocument();
    expect(screen.getByText('33.3%')).toBeInTheDocument();
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
    const patterns = [...container.querySelectorAll('pattern')];
    expect(patterns).toHaveLength(2);
    expect(patterns[0].querySelector('rect')?.getAttribute('fill'))
      .toBe(patterns[1].querySelector('rect')?.getAttribute('fill'));
    expect(patterns[1].querySelector('path')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'All categories' }));
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.queryByText('Taxi')).not.toBeInTheDocument();
  });

  it('handles a removed selection after refetch and leaves flat report data usable', async () => {
    const user = setupUser();
    const { rerender } = renderWithProviders(<CategoryPieChart data={DATA} currency="CNY" />);
    await user.click(screen.getByRole('button', { name: 'View Transport breakdown' }));
    rerender(<CategoryPieChart data={[DATA[1]]} currency="CNY" />);
    expect(screen.queryByRole('button', { name: 'All categories' })).not.toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
  });
});
