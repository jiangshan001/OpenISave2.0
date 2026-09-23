import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createClient()}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <AntApp>
          <MemoryRouter>{children}</MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';

/**
 * antd renders the real <input> behind a styled label with
 * `pointer-events: none`, which user-event refuses to click by default.
 */
export function setupUser() {
  return userEvent.setup({ pointerEventsCheck: 0 });
}
