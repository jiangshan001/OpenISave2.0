import { describe, expect, it, vi } from 'vitest';

import { securityApi } from '@/api/security';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import type { SecurityStatus } from '@/types/security';
import { SecurityGate } from './SecurityGate';

function status(overrides: Partial<SecurityStatus> = {}): SecurityStatus {
  return {
    state: 'ready',
    reason: null,
    message: null,
    app_version: '2.3.0',
    encryption: {
      enabled: true,
      engine: 'SQLCipher',
      cipher_version: '4.12.0 community',
      provider: 'OpenSSL',
      algorithm: 'AES-256',
    },
    key_storage: {
      kind: 'windows_credential_manager',
      label: 'Windows Credential Manager',
      target: 'OpenISave2/DatabaseEncryptionKey',
      present: true,
    },
    data_location: 'C:\\Users\\me\\AppData\\Local\\OpenISave2Data',
    database_path: 'C:\\Users\\me\\AppData\\Local\\OpenISave2Data\\vault\\finance.db',
    backup_location: 'C:\\Users\\me\\AppData\\Local\\OpenISave2Data\\backups',
    last_backup: null,
    backup_count: 0,
    backup_counts: {},
    recovery_key: { configured: false, exported_at: null },
    migration: {
      migrated: false,
      migrated_at: null,
      report: null,
      just_migrated: false,
      plaintext_backup_exists: false,
      plaintext_files: [],
      plaintext_removed_at: null,
      failure: null,
    },
    ...overrides,
  };
}

describe('SecurityGate', () => {
  it('renders the app once the vault is unlocked', async () => {
    vi.spyOn(securityApi, 'status').mockResolvedValue(status());
    renderWithProviders(
      <SecurityGate>
        <div>the app</div>
      </SecurityGate>,
    );
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('asks for the recovery key when the key is missing, then lets the app in', async () => {
    const user = setupUser();
    const locked = status({
      state: 'locked',
      reason: 'key_missing',
      message: 'The encryption key is not in Windows Credential Manager.',
      key_storage: { ...status().key_storage, present: false },
    });
    const statusSpy = vi.spyOn(securityApi, 'status').mockResolvedValue(locked);
    const unlock = vi.spyOn(securityApi, 'unlock').mockImplementation(async () => {
      statusSpy.mockResolvedValue(status());
      return status();
    });

    renderWithProviders(
      <SecurityGate>
        <div>the app</div>
      </SecurityGate>,
    );
    expect(await screen.findByText('Your data is locked')).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/OIS1-/), 'OIS1-ABCDE-FGHIJ-KLMNO');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(unlock).toHaveBeenCalledWith('OIS1-ABCDE-FGHIJ-KLMNO'));
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('never offers an empty database after a failed migration', async () => {
    vi.spyOn(securityApi, 'status').mockResolvedValue(
      status({
        state: 'migration_failed',
        message: 'Your original database is untouched.',
        migration: { ...status().migration, failure: { step: 'copy', reason: 'Busy.' } },
      }),
    );
    renderWithProviders(
      <SecurityGate>
        <div>the app</div>
      </SecurityGate>,
    );
    expect(await screen.findByText('Encryption migration did not complete')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });
});
