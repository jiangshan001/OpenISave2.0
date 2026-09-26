import { Alert, Button, Input, Space, Spin, Typography } from 'antd';
import { useState, type ReactNode } from 'react';

import { errorMessage } from '@/api/client';
import { securityApi } from '@/api/security';
import { BrandMark } from '@/components/common/BrandMark';
import { useSecurityStatus } from '@/hooks/useSecurity';
import type { SecurityStatus } from '@/types/security';
import { VaultMissingPanel } from './VaultMissingPanel';
import '@/styles/startup.css';

/**
 * Renders the app only once the encrypted vault is unlocked. Otherwise it
 * explains the situation and offers the one safe way forward: the recovery
 * key, a migration retry, or a restore. The key itself never reaches here.
 */
export function SecurityGate({ children }: { children: ReactNode }) {
  const status = useSecurityStatus();

  if (status.isLoading) {
    return (
      <div className="oi-startup">
        <Spin />
      </div>
    );
  }
  if (!status.data) {
    return (
      <div className="oi-startup">
        <Alert type="error" showIcon message={errorMessage(status.error)} />
        <Button style={{ marginTop: 16 }} onClick={() => void status.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (status.data.state === 'ready') return <>{children}</>;
  return <LockedScreen status={status.data} onChange={() => void status.refetch()} />;
}

function LockedScreen({ status, onChange }: { status: SecurityStatus; onChange: () => void }) {
  const [recoveryKey, setRecoveryKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setRecoveryKey('');
      onChange();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<string, string> = {
    locked: 'Your data is locked',
    migration_failed: 'Encryption migration did not complete',
    vault_missing: 'Your encrypted database is missing',
    error: 'OpenISave could not open your data',
    starting: 'Opening your data…',
  };

  return (
    <div className="oi-startup" style={{ maxWidth: 620, textAlign: 'left' }}>
      <div style={{ textAlign: 'center' }}>
        <BrandMark className="oi-startup-mark" />
        <h1 className="oi-startup-title">{titles[status.state] ?? titles.error}</h1>
      </div>
      <p className="oi-startup-body">{status.message}</p>

      {status.state === 'locked' || (status.state === 'vault_missing' && !status.key_storage.present) ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            Enter the recovery key you exported from Settings → Data &amp; Security. It is checked
            against your encrypted data before being saved to Windows Credential Manager.
          </Typography.Text>
          <Input.TextArea
            rows={2}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            placeholder="OIS1-XXXXX-XXXXX-…"
            value={recoveryKey}
            onChange={(event) => setRecoveryKey(event.target.value)}
            style={{ fontFamily: 'monospace' }}
          />
          <Button
            type="primary"
            loading={busy}
            disabled={recoveryKey.trim().length < 10}
            onClick={() => void run(() => securityApi.unlock(recoveryKey))}
          >
            Unlock
          </Button>
        </Space>
      ) : null}

      {status.state === 'vault_missing' && status.key_storage.present ? (
        <VaultMissingPanel onRestored={onChange} />
      ) : null}

      {status.state === 'migration_failed' || status.state === 'error' ? (
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {status.migration.failure?.reason ? (
            <Alert type="warning" showIcon message={status.migration.failure.reason} />
          ) : null}
          <Typography.Text type="secondary">
            Nothing was deleted or changed. Close any other OpenISave window, then retry. The
            details are in the migration report inside the data folder.
          </Typography.Text>
          <Space>
            <Button type="primary" loading={busy} onClick={() => void run(() => securityApi.retryMigration())}>
              Retry
            </Button>
            <Button onClick={() => void run(() => securityApi.openDataFolder())}>Open Data Folder</Button>
          </Space>
        </Space>
      ) : null}

      {error ? <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} /> : null}
    </div>
  );
}
