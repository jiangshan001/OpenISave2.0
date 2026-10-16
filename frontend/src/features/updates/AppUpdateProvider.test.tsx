import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { renderWithProviders, screen, setupUser } from '@/test/utils';
import { AppUpdateProvider, useAppUpdates, type InstallProgress } from './AppUpdateProvider';

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/runtime', () => ({ isDesktop: () => true }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: native.invoke,
  Channel: class { onmessage: (progress: InstallProgress) => void = () => {}; },
}));

const available = {
  current_version: '2.4.3', latest_version: '2.4.4', release_url: null,
  notes: 'A signed update', checked_at: 1000, has_update: true,
  dismissed: false, last_error: null, can_install: true,
};
let sendProgress: ((progress: InstallProgress) => void) | undefined;
let finishInstall: (() => void) | undefined;
let rejectInstall: ((error: string) => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  sendProgress = undefined;
  finishInstall = undefined;
  rejectInstall = undefined;
  native.invoke.mockImplementation((command: string, args?: { onEvent: { onmessage: typeof sendProgress } }) => {
    if (command === 'install_app_update') {
      sendProgress = args?.onEvent.onmessage;
      return new Promise<void>((resolve, reject) => {
        finishInstall = resolve;
        rejectInstall = reject;
      });
    }
    return Promise.resolve(available);
  });
});

function Controls() {
  const { state, install, updating, update, check } = useAppUpdates();
  return <>
    <p>{state?.current_version ?? 'loading'}</p>
    <p>Phase: {install.phase}</p>
    <p>{updating ? 'busy' : 'ready'}</p>
    <p>{install.error}</p>
    <button onClick={() => { void update(); void update(); }}>Update</button>
    <button onClick={() => void check()}>Check</button>
  </>;
}

async function renderControls() {
  renderWithProviders(<AppUpdateProvider><Controls /></AppUpdateProvider>);
  await screen.findByText('2.4.3');
}

describe('native update orchestration', () => {
  it('never starts an installation just because a new version was discovered', async () => {
    await renderControls();
    expect(native.invoke.mock.calls.some(([command]) => command === 'install_app_update')).toBe(false);
    expect(screen.getByText('ready')).toBeInTheDocument();
  });

  it('coalesces rapid clicks and receives native progress without concurrent checks', async () => {
    await renderControls();
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(sendProgress).toBeTypeOf('function'));
    expect(native.invoke.mock.calls.filter(([command]) => command === 'install_app_update')).toHaveLength(1);
    await act(async () => sendProgress?.({ phase: 'downloading', downloaded: 100, total: 200, error: null }));
    expect(screen.getByText('Phase: downloading')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(native.invoke.mock.calls.some(([command]) => command === 'check_app_update')).toBe(false);
    await act(async () => finishInstall?.());
    expect(screen.getByText('Phase: installing')).toBeInTheDocument();
  });

  it('surfaces a rejected signature and allows a subsequent explicit retry', async () => {
    await renderControls();
    const user = setupUser();
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(rejectInstall).toBeTypeOf('function'));
    await act(async () => rejectInstall?.('Signature verification failed. Nothing was installed.'));
    expect(screen.getByText('Phase: failed')).toBeInTheDocument();
    expect(screen.getByText('ready')).toBeInTheDocument();
    expect(screen.getByText(/Signature verification failed/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(native.invoke.mock.calls.filter(([command]) => command === 'install_app_update')).toHaveLength(2));
    await act(async () => finishInstall?.());
  });
});
