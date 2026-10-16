import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import type { AppUpdateState, InstallProgress } from './AppUpdateProvider';
import { AppUpdateCard } from './AppUpdateCard';
import { AppUpdateBadge } from './AppUpdateBadge';

const actions = vi.hoisted(() => ({ check: vi.fn(), dismiss: vi.fn(), update: vi.fn() }));
let state: AppUpdateState | null;
let error: string | null;
let install: InstallProgress;
let updating: boolean;
vi.mock('./AppUpdateProvider', () => ({
  useAppUpdates: () => ({ supported: true, state, error, install, updating, checking: false, ...actions }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  install = { phase: 'idle', downloaded: 0, total: null, error: null };
  updating = false;
});

function release(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    current_version: '2.4.1', latest_version: '2.5.0',
    release_url: 'https://github.com/jiangshan001/OpenISave2.0/releases/tag/v2.5.0',
    notes: 'Improved categories', checked_at: 1000, has_update: true,
    dismissed: false, last_error: null, can_install: true, ...overrides,
  };
}

describe('App update controls', () => {
  it('starts an in-app update only when clicked and offers a per-version skip', async () => {
    state = release(); error = null;
    renderWithProviders(<AppUpdateCard />);
    expect(actions.update).not.toHaveBeenCalled();
    expect(screen.getByText('Version 2.5.0 available')).toBeInTheDocument();
    const user = setupUser();
    expect(screen.queryByRole('button', { name: /Open download page/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Update now/ }));
    expect(actions.update).toHaveBeenCalledOnce();
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
    expect(screen.queryByRole('button', { name: /Update now/ })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Update now/ })).toBeInTheDocument();
  });

  it('does not install from an old unsigned cache', () => {
    state = release({ can_install: false }); error = null;
    renderWithProviders(<AppUpdateCard />);
    expect(screen.getByRole('button', { name: /Update now/ })).toBeDisabled();
    expect(screen.getByText(/Check for updates again to prepare/)).toBeInTheDocument();
  });

  it('shows real byte progress and blocks competing update actions', () => {
    state = release(); error = null; updating = true;
    install = { phase: 'downloading', downloaded: 1048576, total: 2097152, error: null };
    renderWithProviders(<AppUpdateCard />);
    expect(screen.getByText('1.0 MB of 2.0 MB')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByRole('button', { name: /Check for updates/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Downloading update/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip this version' })).toBeDisabled();
  });

  it('handles an unknown total and a verification failure with a retry', async () => {
    state = release(); error = null; updating = true;
    install = { phase: 'downloading', downloaded: 1048576, total: null, error: null };
    const { rerender } = renderWithProviders(<AppUpdateCard />);
    expect(screen.getByText('1.0 MB downloaded')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    updating = false;
    install = { phase: 'failed', downloaded: 0, total: null, error: 'Signature verification failed. Nothing was installed.' };
    rerender(<AppUpdateCard />);
    expect(screen.getByText(/Signature verification failed/)).toBeInTheDocument();
    await setupUser().click(screen.getByRole('button', { name: /Retry update/ }));
    expect(actions.update).toHaveBeenCalledOnce();
  });

  it.each(['preparing', 'verifying', 'installing'] as const)('announces the %s phase', (phase) => {
    state = release(); error = null; updating = true;
    install = { phase, downloaded: 0, total: null, error: null };
    renderWithProviders(<AppUpdateCard />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Check for updates/ })).toBeDisabled();
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
