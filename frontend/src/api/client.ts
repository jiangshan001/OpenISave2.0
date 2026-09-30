import type { ApiErrorBody } from '@/types';
import { getApiOrigin } from './runtime';

const API_PATH = '/api/v1';

/** Relative in the browser, absolute against the sidecar in the desktop app. */
function apiUrl(path: string): string {
  return `${getApiOrigin()}${API_PATH}${path}`;
}

/** An error carrying the backend's explanation so the UI never shows a raw 500. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details ?? {};
  }

  get isFxUnavailable(): boolean {
    return this.code === 'fx_rate_unavailable';
  }
}

const NETWORK_MESSAGE =
  'Could not reach the OpenISave backend. Check that the API server is running on 127.0.0.1:8756.';

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {
    code: 'unknown_error',
    message: `Request failed with status ${response.status}.`,
  };
  try {
    const parsed = await response.json();
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      body = parsed as ApiErrorBody;
    }
  } catch {
    // Response had no JSON body; keep the generic message.
  }
  return new ApiError(response.status, body);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, { code: 'network_error', message: NETWORK_MESSAGE });
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function withQuery(path: string, params?: Record<string, unknown>): string {
  if (!params) return path;
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) => request<T>(withQuery(path, params)),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Send a file as the raw request body. It never touches the network beyond 127.0.0.1. */
  upload: <T>(path: string, file: Blob, fileName: string) =>
    request<T>(path, {
      method: 'POST',
      body: file,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(fileName),
      },
    }),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred.';
}
