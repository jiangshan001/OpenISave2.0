import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isDesktop } from '@/api/runtime';

export interface AppUpdateState {
  current_version: string;
  latest_version: string | null;
  release_url: string | null;
  notes: string | null;
  checked_at: number | null;
  has_update: boolean;
  dismissed: boolean;
  last_error: string | null;
  can_install: boolean;
  install?: InstallProgress;
}

export interface InstallProgress {
  phase: 'idle' | 'preparing' | 'downloading' | 'verifying' | 'installing' | 'failed';
  downloaded: number;
  total: number | null;
  error: string | null;
}

const IDLE: InstallProgress = { phase: 'idle', downloaded: 0, total: null, error: null };

interface AppUpdates {
  supported: boolean;
  state: AppUpdateState | null;
  checking: boolean;
  error: string | null;
  check: () => Promise<void>;
  dismiss: () => Promise<void>;
  install: InstallProgress;
  updating: boolean;
  update: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdates>({
  supported: false, state: null, checking: false, error: null,
  install: IDLE, updating: false,
  check: async () => {}, dismiss: async () => {}, update: async () => {},
});

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: desktopInvoke } = await import('@tauri-apps/api/core');
  return desktopInvoke<T>(command, args);
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const supported = isDesktop();
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [install, setInstall] = useState<InstallProgress>(IDLE);
  const installRunning = useRef(false);

  const runCheck = useCallback(async (force: boolean) => {
    if (!supported || installRunning.current) return;
    setChecking(true);
    try {
      const next = await invoke<AppUpdateState>('check_app_update', { force });
      setState(next);
      setError(next.last_error);
    } catch {
      setError('Update checking is unavailable. Your ledger is still available.');
    } finally {
      setChecking(false);
    }
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void invoke<AppUpdateState>('app_update_state').then((cached) => {
      if (active) {
        setState(cached);
        setError(cached.last_error);
        if (!installRunning.current) setInstall(cached.install ?? IDLE);
      }
    }).catch(() => {});
    // Delay until the first screen is rendered. Rust persists a daily cooldown,
    // so hourly ticks and relaunches do not generate repeated GitHub requests.
    const startup = window.setTimeout(() => { void runCheck(false); }, 3000);
    const timer = window.setInterval(() => { void runCheck(false); }, 60 * 60 * 1000);
    return () => {
      active = false;
      window.clearTimeout(startup);
      window.clearInterval(timer);
    };
  }, [runCheck, supported]);

  const dismiss = async () => {
    if (installRunning.current) return;
    try {
      setState(await invoke<AppUpdateState>('dismiss_app_update'));
    } catch {
      setError('Could not save your update preference. Please try again.');
    }
  };

  const update = async () => {
    if (!supported || !state?.can_install || checking || installRunning.current) return;
    installRunning.current = true;
    setInstall({ ...IDLE, phase: 'preparing' });
    try {
      const { Channel, invoke: desktopInvoke } = await import('@tauri-apps/api/core');
      const channel = new Channel<InstallProgress>();
      channel.onmessage = setInstall;
      await desktopInvoke<void>('install_app_update', { onEvent: channel });
      setInstall({ ...IDLE, phase: 'installing' });
    } catch (failure) {
      setInstall({ ...IDLE, phase: 'failed', error: typeof failure === 'string'
        ? failure : 'The update could not finish. Check your connection and retry.' });
    } finally {
      installRunning.current = false;
    }
  };

  const updating = !['idle', 'failed'].includes(install.phase);

  return (
    <AppUpdateContext.Provider value={{
      supported, state, checking, error, check: () => runCheck(true), dismiss,
      install, updating, update,
    }}>
      {children}
    </AppUpdateContext.Provider>
  );
}

export const useAppUpdates = () => useContext(AppUpdateContext);
