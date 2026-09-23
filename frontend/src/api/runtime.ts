/**
 * Where the API lives at runtime.
 *
 * In the browser the Vite dev server proxies `/api`, so a relative path is
 * right. Inside the desktop shell the page is served from the app's own
 * origin, so requests must go to the backend the shell started — on a port it
 * chose at launch, and only once that backend is actually listening.
 */

let apiOrigin = '';

export type StartupStatus = 'ready' | 'failed';

interface ApiInfo {
  status: 'starting' | 'ready' | 'failed';
  base_url: string | null;
  bundled: boolean;
  message: string | null;
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getApiOrigin(): string {
  return apiOrigin;
}

export function setApiOrigin(origin: string): void {
  apiOrigin = origin.replace(/\/$/, '');
}

const POLL_INTERVAL_MS = 400;
const POLL_TIMEOUT_MS = 90_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for the desktop shell to report a usable backend.
 *
 * The shell starts the backend on a background thread so the window appears
 * immediately, which means the answer here is "starting" for the first few
 * seconds. `onProgress` lets the caller show a splash meanwhile.
 */
export async function resolveApiOrigin(
  onProgress?: (message: string) => void,
): Promise<{ status: StartupStatus; message?: string }> {
  if (!isDesktop()) return { status: 'ready' };

  let invoke: <T>(cmd: string) => Promise<T>;
  try {
    ({ invoke } = await import('@tauri-apps/api/core'));
  } catch {
    return { status: 'failed', message: 'The desktop shell could not be reached.' };
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastMessage: string | undefined;

  while (Date.now() < deadline) {
    let info: ApiInfo;
    try {
      info = await invoke<ApiInfo>('api_info');
    } catch {
      return { status: 'failed', message: 'The desktop shell stopped responding.' };
    }

    if (info.status === 'ready') {
      if (info.base_url) setApiOrigin(info.base_url);
      return { status: 'ready' };
    }
    if (info.status === 'failed') {
      return { status: 'failed', message: info.message ?? undefined };
    }

    lastMessage = 'Starting your local data service…';
    onProgress?.(lastMessage);
    await wait(POLL_INTERVAL_MS);
  }

  return { status: 'failed', message: lastMessage ?? 'The data service did not start in time.' };
}
