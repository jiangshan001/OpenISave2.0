import dayjs from 'dayjs';

export function formatBackupTime(iso: string | null | undefined): string {
  return iso ? dayjs(iso).format('DD MMM YYYY, HH:mm') : '—';
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
