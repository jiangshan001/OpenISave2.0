import { Alert, Button, Empty, Skeleton, Space } from 'antd';
import type { ReactNode } from 'react';

import { ApiError } from '@/api/client';

interface StateBoundaryProps {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  skeletonRows?: number;
  children: ReactNode;
}

/**
 * One place for the loading / error / empty triad so every page handles the
 * three states the same way.
 */
export function StateBoundary({
  isLoading,
  error,
  isEmpty = false,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  onRetry,
  skeletonRows = 4,
  children,
}: StateBoundaryProps) {
  if (isLoading) {
    return <Skeleton active paragraph={{ rows: skeletonRows }} />;
  }

  if (error) {
    const apiError = error instanceof ApiError ? error : null;
    return (
      <Alert
        type={apiError?.isFxUnavailable ? 'warning' : 'error'}
        showIcon
        message={apiError?.isFxUnavailable ? 'Exchange rate unavailable' : 'Could not load data'}
        description={
          <Space direction="vertical" size="small">
            <span>{error instanceof Error ? error.message : String(error)}</span>
            {onRetry ? (
              <Button size="small" onClick={onRetry}>
                Try again
              </Button>
            ) : null}
          </Space>
        }
      />
    );
  }

  if (isEmpty) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Space direction="vertical" size={4}>
            <strong>{emptyTitle}</strong>
            {emptyDescription ? (
              <span className="oi-muted">{emptyDescription}</span>
            ) : null}
          </Space>
        }
      >
        {emptyAction}
      </Empty>
    );
  }

  return <>{children}</>;
}
