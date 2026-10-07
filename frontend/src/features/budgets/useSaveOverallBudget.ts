import { useMutation } from '@tanstack/react-query';
import { App } from 'antd';

import { errorMessage } from '@/api/client';
import { budgetsApi } from '@/api/resources';
import { useInvalidateFinancialViews } from '@/hooks/useResources';

export function useSaveOverallBudget(year: number, month: number, onDone?: () => void) {
  const invalidate = useInvalidateFinancialViews();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (limit: number | null) => budgetsApi.saveOverall(year, month, limit),
    onSuccess: () => {
      invalidate();
      message.success('Monthly budget saved.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}
