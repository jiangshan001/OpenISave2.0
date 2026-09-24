export type VaultState =
  | 'starting'
  | 'ready'
  | 'locked'
  | 'migration_failed'
  | 'vault_missing'
  | 'error';

export interface BackupInfo {
  id: string;
  kind: 'daily' | 'weekly' | 'monthly' | 'manual' | 'safety';
  created_at: string;
  reason: string | null;
  size_bytes: number;
}

/** Everything the backend is willing to say about storage. Never a key. */
export interface SecurityStatus {
  state: VaultState;
  reason: string | null;
  message: string | null;
  app_version: string;
  encryption: {
    enabled: boolean;
    engine: string;
    cipher_version: string | null;
    provider: string | null;
    algorithm: string;
  };
  key_storage: { kind: string; label: string; target: string; present: boolean };
  data_location: string;
  database_path: string;
  backup_location: string;
  last_backup: BackupInfo | null;
  backup_count: number;
  backup_counts: Partial<Record<BackupInfo['kind'], number>>;
  recovery_key: { configured: boolean; exported_at: string | null };
  migration: {
    migrated: boolean;
    migrated_at: string | null;
    report: string | null;
    just_migrated: boolean;
    plaintext_backup_exists: boolean;
    plaintext_files: string[];
    plaintext_removed_at: string | null;
    failure: { step: string | null; reason: string | null } | null;
  };
}
