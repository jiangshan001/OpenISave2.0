import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useEffect, useRef } from 'react';

import { errorMessage } from '@/api/client';
import { recurringApi } from '@/api/recurring';
import type { RecurringPayload } from '@/types/recurring';
import { LEDGER_DEPENDENT_KEYS, queryKeys } from './queryKeys';

function useInvalidateLedger() {
  const client = useQueryClient();
  return () =>
    LEDGER_DEPENDENT_KEYS.forEach((key) => {
      void client.invalidateQueries({ queryKey: [key] });
    });
}

export function useRecurringRules(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.recurring(includeArchived),
    queryFn: () => recurringApi.list(includeArchived),
  });
}

export function useUpcoming(days = 14) {
  return useQuery({
    queryKey: queryKeys.upcoming(days),
    queryFn: () => recurringApi.upcoming(days),
  });
}

export function useSaveRecurring(onDone?: () => void) {
  const invalidate = useInvalidateLedger();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id?: number; payload: RecurringPayload }) =>
      input.id ? recurringApi.update(input.id, input.payload) : recurringApi.create(input.payload),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(input.id ? 'Recurring transaction updated.' : 'Recurring transaction created.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

type StatusAction = 'pause' | 'resume' | 'archive';

const STATUS_MESSAGES: Record<StatusAction, string> = {
  pause: 'Paused. Nothing will be created until you resume it.',
  resume: 'Resumed from today.',
  archive: 'Archived. Transactions it already created are kept.',
};

export function useRecurringStatus() {
  const invalidate = useInvalidateLedger();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { id: number; action: StatusAction }) => recurringApi[input.action](input.id),
    onSuccess: (_data, input) => {
      invalidate();
      message.success(STATUS_MESSAGES[input.action]);
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useOccurrenceAction() {
  const invalidate = useInvalidateLedger();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (input: { ruleId: number; date: string; action: 'generate' | 'skip' }) =>
      recurringApi[input.action](input.ruleId, input.date),
    onSuccess: (result) => {
      invalidate();
      message.success(
        result.status === 'generated' ? 'Transaction created.' : 'Occurrence skipped.',
      );
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

/**
 * Create due occurrences of automatic rules once per app launch. The backend
 * is idempotent, so a second call (another window, a reload) creates nothing.
 */
export function useProcessDueOnLaunch() {
  const invalidate = useInvalidateLedger();
  const { notification } = App.useApp();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    recurringApi
      .processDue()
      .then((result) => {
        if (result.generated.length > 0) {
          invalidate();
          notification.info({
            message: 'Recurring transactions created',
            description: `${result.generated.length} automatic recurring transaction${
              result.generated.length === 1 ? ' was' : 's were'
            } recorded.`,
          });
        }
        if (result.failed.length > 0) {
          notification.warning({
            message: 'Some recurring transactions could not be created',
            description: result.failed[0].message,
          });
        }
      })
      .catch(() => {
        // Locked vault or offline backend: the next launch will try again.
      });
  }, [invalidate, notification]);
}
