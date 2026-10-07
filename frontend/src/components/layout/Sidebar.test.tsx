import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '@/test/utils';
import packageJson from '../../../package.json';
import { selectedKey } from './navItems';
import { Sidebar } from './Sidebar';

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const PAGES = ['Overview', 'Transactions', 'Recurring', 'Accounts', 'Assets', 'Goals', 'Budget',
  'Categories', 'Reports', 'Settings'];

describe('Sidebar', () => {
  it('shows the released app version from package.json', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText(`Version ${packageJson.version}`)).toBeInTheDocument();
    expect(packageJson.version).toBe('2.4.0');
  });

  it('keeps the privacy status and a compact theme control in the footer', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByText('Local & encrypted')).toBeInTheDocument();
    expect(screen.getByText('Theme')).toBeInTheDocument();
    for (const label of ['System', 'Light', 'Dark']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('marks exactly the current page as active, including nested routes', () => {
    renderAt('/goals');
    const active = document.querySelectorAll('.ant-menu-item-selected');
    expect(active).toHaveLength(1);
    expect(active[0]).toHaveTextContent('Goals');

    expect(selectedKey('/')).toBe('/');
    expect(selectedKey('/accounts/12')).toBe('/accounts');
    expect(selectedKey('/transactions/import/wechat')).toBe('/transactions');
    expect(selectedKey('/nowhere')).toBe('/');
  });

  it('names every page in text; icon wells are decorative', () => {
    renderAt('/');
    for (const page of PAGES) {
      expect(screen.getByRole('menuitem', { name: page })).toBeInTheDocument();
    }
    const wells = document.querySelectorAll('.oi-nav-icon');
    expect(wells).toHaveLength(PAGES.length);
    wells.forEach((well) => expect(well).toHaveAttribute('aria-hidden', 'true'));
  });

  it('gives a few items a semantic hover gesture and the rest the shared default', () => {
    renderAt('/');
    const motion = (page: string) =>
      screen.getByRole('menuitem', { name: page }).querySelector('.oi-nav-icon')?.getAttribute('data-motion');
    expect(motion('Transactions')).toBe('swap');
    expect(motion('Recurring')).toBe('turn');
    expect(motion('Accounts')).toBe('lift');
    expect(motion('Goals')).toBe('flag');
    expect(motion('Settings')).toBe('gear');
    expect(motion('Overview')).toBe('default');
    expect(motion('Reports')).toBe('default');
  });
});
