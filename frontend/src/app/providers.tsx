import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import enUS from 'antd/locale/en_US';
import type { ReactNode } from 'react';

import { ApiError } from '@/api/client';
import { ThemeProvider } from '@/theme/ThemeProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Validation and FX problems are answers, not transient failures.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider locale={enUS}>
        <AntApp>{children}</AntApp>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
