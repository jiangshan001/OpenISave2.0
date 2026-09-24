import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';

import { errorMessage } from '@/api/client';
import { securityApi } from '@/api/security';

const STATUS_KEY = ['security', 'status'] as const;
const BACKUPS_KEY = ['security', 'backups'] as const;

export function useSecurityStatus() {
  return useQuery({ queryKey: STATUS_KEY, queryFn: () => securityApi.status() });
}

export function useBackups(enabled = true) {
  return useQuery({ queryKey: BACKUPS_KEY, queryFn: () => securityApi.backups(), enabled });
}

function useRefreshSecurity() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: ['security'] });
  };
}

export function useBackUpNow() {
  const refresh = useRefreshSecurity();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: () => securityApi.backUpNow(),
    onSuccess: () => {
      refresh();
      message.success('Encrypted backup created and verified.');
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useOpenDataFolder() {
  const { message } = App.useApp();
  return useMutation({
    mutationFn: () => securityApi.openDataFolder(),
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useRestoreBackup(onDone?: () => void) {
  const client = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (backupId: string) => securityApi.restore(backupId),
    onSuccess: () => {
      // Every cached figure now describes the old database.
      void client.invalidateQueries();
      message.success('Backup restored. A safety copy of the previous data was kept.');
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useRemovePlaintext(onDone?: () => void) {
  const refresh = useRefreshSecurity();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: () => securityApi.removePlaintext(),
    onSuccess: (result) => {
      refresh();
      message.success(`Removed ${result.removed_files} unencrypted file(s).`);
      onDone?.();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}
