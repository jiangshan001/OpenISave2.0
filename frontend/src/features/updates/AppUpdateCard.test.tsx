import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import type { AppUpdateState } from './AppUpdateProvider';
import { AppUpdateCard } from './AppUpdateCard';
import { AppUpdateBadge } from './AppUpdateBadge';

const actions = vi.hoisted(() => ({ check: vi.fn(), dismiss: vi.fn(), openRelease: vi.fn() }));
let state: AppUpdateState | null;
let error: string | null;
vi.mock('./AppUpdateProvider', () => ({
  useAppUpdates: () => ({ supported: true, state, error, checking: false, ...actions }),
}));

function release(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    current_version: '2.4.1', latest_version: '2.5.0',
    release_url: 'https://github.com/jiangshan001/OpenISave2.0/releases/tag/v2.5.0',
    notes: 'Improved categories', checked_at: 1000, has_update: true,
    dismissed: false, last_error: null, ...overrides,
  };
}

describe('App update controls', () => {
  it('opens the release only when the user clicks and offers a per-version skip', async () => {
    state = release(); error = null;
    renderWithProviders(<AppUpdateCard />);
    expect(actions.openRelease).not.toHaveBeenCalled();
    expect(screen.getByText('Version 2.5.0 available')).toBeInTheDocument();
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: /Open download page/ }));
    expect(actions.openRelease).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Skip this version' }));
    expect(actions.dismiss).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: /Check for updates/ }));
    expect(actions.check).toHaveBeenCalledOnce();
  });

  it('reports an offline failure without claiming the app is up to date', () => {
    state = release({ has_update: false }); error = 'Could not reach GitHub';
    renderWithProviders(<AppUpdateCard />);
    expect(screen.getByText('Could not reach GitHub')).toBeInTheDocument();
    expect(screen.queryByText('No newer version is available.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open download page/ })).not.toBeInTheDocument();
  });

  it('does not claim an unchecked installation is up to date', () => {
    state = release({ checked_at: null, has_update: false }); error = null;
    renderWithProviders(<AppUpdateCard />);
    expect(screen.getByText('Not checked yet.')).toBeInTheDocument();
    expect(screen.queryByText('No newer version is available.')).not.toBeInTheDocument();
  });

  it('retains the last known update during a failed recheck', () => {
    state = release(); error = 'Could not reach GitHub';
    renderWithProviders(<AppUpdateCard />);
    expect(screen.getByText('Last known available version: 2.5.0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open download page/ })).toBeInTheDocument();
  });

  it('hides the sidebar notice for a skipped or already installed version', () => {
    state = release({ dismissed: true }); error = null;
    const { rerender } = renderWithProviders(<AppUpdateBadge />);
    expect(screen.queryByRole('button', { name: 'Update available' })).not.toBeInTheDocument();
    state = release({ has_update: false });
    rerender(<AppUpdateBadge />);
    expect(screen.queryByRole('button', { name: 'Update available' })).not.toBeInTheDocument();
    state = release();
    rerender(<AppUpdateBadge />);
    expect(screen.getByRole('button', { name: 'Update available' })).toBeInTheDocument();
  });

  it('renders release notes as text rather than executing release HTML', () => {
    state = release({ notes: '<script>alert(1)</script>' }); error = null;
    renderWithProviders(<AppUpdateCard />);
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
});
