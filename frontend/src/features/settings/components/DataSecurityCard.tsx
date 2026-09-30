import {
  CheckOutlined,
  CloudUploadOutlined,
  ExclamationOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  KeyOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { useState, type ReactNode } from 'react';

import { StateBoundary } from '@/components/common/StateBoundary';
import { useBackUpNow, useOpenDataFolder, useSecurityStatus } from '@/hooks/useSecurity';
import { RecoveryKeyModal } from './RecoveryKeyModal';
import { RemovePlaintextModal } from './RemovePlaintextModal';
import { RestoreBackupModal } from './RestoreBackupModal';
import { formatBackupTime } from './securityFormat';

type Tone = 'positive' | 'warning' | 'negative';

/** Status in words first; the tone and glyph only reinforce it. */
function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`oi-chip oi-chip--${tone}`}>
      {tone === 'positive' ? <CheckOutlined /> : <ExclamationOutlined />}
      {children}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Settings → Data & Security. Shows where data lives and how it is protected. */
export function DataSecurityCard() {
  const status = useSecurityStatus();
  const backUp = useBackUpNow();
  const openFolder = useOpenDataFolder();
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [plaintextOpen, setPlaintextOpen] = useState(false);
  const data = status.data;

  return (
    <Card
      id="data-security"
      title="Data & Security"
      variant="borderless"
      extra={
        <Space wrap>
          <Button icon={<CloudUploadOutlined />} loading={backUp.isPending} onClick={() => backUp.mutate()}>
            Back Up Now
          </Button>
          <Button icon={<FolderOpenOutlined />} onClick={() => openFolder.mutate()}>
            Open Data Folder
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setRestoreOpen(true)}>
            Restore Backup
          </Button>
        </Space>
      }
    >
      <StateBoundary isLoading={status.isLoading} error={status.error} onRetry={() => void status.refetch()}>
        {data ? (
          <Space direction="vertical" size={18} className="oi-full">
            {data.migration.plaintext_backup_exists ? (
              <Alert
                type="warning"
                showIcon
                message="Encryption migration successful. An unencrypted migration backup exists."
                description="Your data was moved into the encrypted vault and verified. The original OpenISave 2.0 files are still on disk, unencrypted, as a rollback copy. Remove them once you are happy the encrypted data opens correctly."
                action={
                  <Button danger size="small" onClick={() => setPlaintextOpen(true)}>
                    Securely remove old plaintext backup
                  </Button>
                }
              />
            ) : null}

            <div className="oi-vault">
              <span className="oi-vault-mark" aria-hidden>
                <LockOutlined />
              </span>
              <div className="oi-vault-text">
                <div className="oi-vault-title">
                  Encrypted with {data.encryption.engine}
                  {data.encryption.cipher_version ? ` ${data.encryption.cipher_version}` : ''}
                </div>
                <div className="oi-vault-meta">{data.encryption.algorithm}</div>
              </div>
            </div>

            <dl className="oi-facts oi-facts--grid">
              <Fact label="Encryption key">
                {data.key_storage.present ? (
                  <Status tone="positive">Stored in {data.key_storage.label}</Status>
                ) : (
                  <Status tone="negative">Not found in {data.key_storage.label}</Status>
                )}
              </Fact>
              <Fact label="Recovery key">
                <Space size={8} wrap>
                  {data.recovery_key.configured ? (
                    <Status tone="positive">Configured</Status>
                  ) : (
                    <Status tone="warning">Not configured</Status>
                  )}
                  <Button size="small" icon={<KeyOutlined />} onClick={() => setRecoveryOpen(true)}>
                    Export Recovery Key
                  </Button>
                </Space>
              </Fact>
              <Fact label="Last backup">
                {data.last_backup ? (
                  <span>
                    {formatBackupTime(data.last_backup.created_at)}{' '}
                    <span className="oi-muted">· {data.last_backup.kind}</span>
                  </span>
                ) : (
                  <Status tone="warning">None yet</Status>
                )}
              </Fact>
              <Fact label="Backups">
                <span className="oi-num">{data.backup_count} encrypted</span>
                <div className="oi-muted oi-small">
                  {['daily', 'weekly', 'monthly', 'manual', 'safety']
                    .map((kind) => `${data.backup_counts[kind as 'daily'] ?? 0} ${kind}`)
                    .join(' · ')}
                </div>
              </Fact>
              <Fact label="Data location">
                <Typography.Text code className="oi-path">
                  {data.data_location}
                </Typography.Text>
              </Fact>
            </dl>

            {!data.recovery_key.configured ? (
              <Alert
                type="info"
                showIcon
                message="Save your recovery key"
                description="If Windows Credential Manager is ever lost (a new PC, a reinstalled Windows), the recovery key is the only way to open your encrypted data and backups."
              />
            ) : null}
            <p className="oi-note oi-flush oi-small">
              Backups are encrypted with the same key: 7 daily, 4 weekly and 12 monthly are kept,
              plus a safety copy before every schema change or restore.
            </p>
          </Space>
        ) : null}
      </StateBoundary>

      <RecoveryKeyModal open={recoveryOpen} onClose={() => setRecoveryOpen(false)} />
      <RestoreBackupModal open={restoreOpen} onClose={() => setRestoreOpen(false)} />
      <RemovePlaintextModal
        open={plaintextOpen}
        files={data?.migration.plaintext_files ?? []}
        onClose={() => setPlaintextOpen(false)}
      />
    </Card>
  );
}
