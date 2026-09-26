import { api } from './client';
import type { BackupInfo, SecurityStatus } from '@/types/security';

export const securityApi = {
  status: () => api.get<SecurityStatus>('/security/status'),
  unlock: (recoveryKey: string) =>
    api.post<SecurityStatus>('/security/unlock', { recovery_key: recoveryKey }),
  retryMigration: () => api.post<SecurityStatus>('/security/migration/retry'),
  /** Returns the recovery key once, on explicit request. Never cache it. */
  exportRecoveryKey: () =>
    api.post<{ recovery_key: string }>('/security/recovery-key/export', { confirm: true }),
  backups: () => api.get<BackupInfo[]>('/security/backups'),
  backUpNow: () => api.post<BackupInfo>('/security/backups'),
  verifyBackup: (backupId: string) =>
    api.post<{ backup: BackupInfo; ok: boolean; problems: string[] }>('/security/backups/verify', {
      backup_id: backupId,
    }),
  restore: (backupId: string) =>
    api.post<{ restored: BackupInfo; safety_backup: BackupInfo | null; status: SecurityStatus }>(
      '/security/restore',
      { backup_id: backupId, confirm: true },
    ),
  openDataFolder: () => api.post<{ opened: string }>('/security/open-data-folder'),
  removePlaintext: () =>
    api.post<{ removed_files: number; status: SecurityStatus }>('/security/plaintext/remove', {
      confirm: 'REMOVE PLAINTEXT',
    }),
};
