import {
  CloudUploadOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  KeyOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Descriptions, Space, Tag, Typography } from 'antd';
import { useState } from 'react';

import { StateBoundary } from '@/components/common/StateBoundary';
import { useBackUpNow, useOpenDataFolder, useSecurityStatus } from '@/hooks/useSecurity';
import { RecoveryKeyModal } from './RecoveryKeyModal';
import { RemovePlaintextModal } from './RemovePlaintextModal';
import { RestoreBackupModal } from './RestoreBackupModal';
import { formatBackupTime } from './securityFormat';

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
      title={
        <Space>
          <LockOutlined />
          Data &amp; Security
        </Space>
      }
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
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
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

            <Descriptions column={{ xs: 1, md: 2 }} size="small" colon={false}>
              <Descriptions.Item label="Database Encryption">
                <Tag color="green">{data.encryption.engine} · Encrypted</Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {data.encryption.cipher_version ? `SQLCipher ${data.encryption.cipher_version}` : ''}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Encryption Key">
                {data.key_storage.present ? (
                  <Tag color="green">Stored in {data.key_storage.label}</Tag>
                ) : (
                  <Tag color="red">Not found in {data.key_storage.label}</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Data Location">
                <Typography.Text code style={{ fontSize: 12 }}>
                  {data.data_location}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Last Backup">
                {data.last_backup ? (
                  <span>
                    {formatBackupTime(data.last_backup.created_at)}{' '}
                    <Tag bordered={false}>{data.last_backup.kind}</Tag>
                  </span>
                ) : (
                  <Tag color="orange">None yet</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Backups">
                {data.backup_count} encrypted ·{' '}
                <span className="oi-muted">
                  {['daily', 'weekly', 'monthly', 'manual', 'safety']
                    .map((kind) => `${data.backup_counts[kind as 'daily'] ?? 0} ${kind}`)
                    .join(' · ')}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Recovery Key">
                <Space size={8}>
                  {data.recovery_key.configured ? (
                    <Tag color="green">Configured</Tag>
                  ) : (
                    <Tag color="orange">Not configured</Tag>
                  )}
                  <Button size="small" icon={<KeyOutlined />} onClick={() => setRecoveryOpen(true)}>
                    Export Recovery Key
                  </Button>
                </Space>
              </Descriptions.Item>
            </Descriptions>

            {!data.recovery_key.configured ? (
              <Alert
                type="info"
                showIcon
                message="Save your recovery key"
                description="If Windows Credential Manager is ever lost (a new PC, a reinstalled Windows), the recovery key is the only way to open your encrypted data and backups."
              />
            ) : null}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {data.encryption.algorithm}. Backups are encrypted with the same key: 7 daily, 4
              weekly and 12 monthly are kept, plus a safety copy before every schema change or
              restore.
            </Typography.Text>
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
