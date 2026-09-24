import { Alert, Button, List, Popconfirm, Space, Typography } from 'antd';

import { errorMessage } from '@/api/client';
import { formatBackupTime } from '@/features/settings/components/securityFormat';
import { useBackups, useRestoreBackup } from '@/hooks/useSecurity';

/** The vault file is gone but the key and backups are not: restore one. */
export function VaultMissingPanel({ onRestored }: { onRestored: () => void }) {
  const backups = useBackups();
  const restore = useRestoreBackup(onRestored);

  if (backups.error) return <Alert type="error" showIcon message={errorMessage(backups.error)} />;
  const rows = backups.data ?? [];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Typography.Text type="secondary">
        OpenISave will not create an empty database while your data might still be recoverable.
        Choose the most recent backup to restore.
      </Typography.Text>
      <List
        size="small"
        bordered
        loading={backups.isLoading}
        dataSource={rows.slice(0, 8)}
        locale={{ emptyText: 'No encrypted backups were found in the data folder.' }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Popconfirm
                key="restore"
                title="Restore this backup?"
                okText="Restore"
                onConfirm={() => restore.mutate(item.id)}
              >
                <Button size="small" type="link" loading={restore.isPending}>
                  Restore
                </Button>
              </Popconfirm>,
            ]}
          >
            {formatBackupTime(item.created_at)} · {item.kind}
          </List.Item>
        )}
      />
    </Space>
  );
}
