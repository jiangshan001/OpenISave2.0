import { Alert, App, Button, Modal, Popconfirm, Space, Table, Tag } from 'antd';
import { useState } from 'react';

import { errorMessage } from '@/api/client';
import { securityApi } from '@/api/security';
import { useBackups, useRestoreBackup } from '@/hooks/useSecurity';
import type { BackupInfo } from '@/types/security';
import { formatBackupTime, formatBytes } from './securityFormat';

interface RestoreBackupModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Pick a backup, verify it, then restore. The backend re-verifies the
 * backup, checks the key and schema, and takes a safety backup of the
 * current data before swapping anything.
 */
export function RestoreBackupModal({ open, onClose }: RestoreBackupModalProps) {
  const { message } = App.useApp();
  const backups = useBackups(open);
  const [selected, setSelected] = useState<BackupInfo | null>(null);
  const [verified, setVerified] = useState<{ id: string; ok: boolean; problems: string[] } | null>(
    null,
  );
  const [verifying, setVerifying] = useState(false);
  const restore = useRestoreBackup(() => {
    onClose();
    window.location.reload();
  });

  const verify = async (backup: BackupInfo) => {
    setVerifying(true);
    try {
      const result = await securityApi.verifyBackup(backup.id);
      setVerified({ id: backup.id, ok: result.ok, problems: result.problems });
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setVerifying(false);
    }
  };

  const ready = selected !== null && verified?.id === selected.id && verified.ok;

  return (
    <Modal
      open={open}
      title="Restore a backup"
      onCancel={onClose}
      width={720}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button disabled={!selected} loading={verifying} onClick={() => selected && void verify(selected)}>
            Verify
          </Button>
          <Popconfirm
            title="Replace your current data with this backup?"
            description="A safety backup of your current data is taken first."
            okText="Restore"
            okButtonProps={{ danger: true }}
            disabled={!ready}
            onConfirm={() => selected && restore.mutate(selected.id)}
          >
            <Button type="primary" danger disabled={!ready} loading={restore.isPending}>
              Restore
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <Table<BackupInfo>
        rowKey="id"
        size="small"
        loading={backups.isLoading}
        dataSource={backups.data ?? []}
        pagination={{ pageSize: 8, hideOnSinglePage: true }}
        rowSelection={{
          type: 'radio',
          selectedRowKeys: selected ? [selected.id] : [],
          onChange: (_, rows) => {
            setSelected(rows[0] ?? null);
            setVerified(null);
          },
        }}
        columns={[
          { title: 'Created', render: (_, row) => formatBackupTime(row.created_at) },
          {
            title: 'Type',
            render: (_, row) => (
              <Tag bordered={false}>{row.reason ? `${row.kind} · ${row.reason}` : row.kind}</Tag>
            ),
          },
          { title: 'Size', align: 'right', render: (_, row) => formatBytes(row.size_bytes) },
        ]}
      />
      {verified && selected && verified.id === selected.id ? (
        <Alert
          className="oi-mt-12"
          type={verified.ok ? 'success' : 'error'}
          showIcon
          message={
            verified.ok
              ? 'Backup verified: it opens with your key, every page authenticates and the schema is compatible.'
              : `This backup cannot be restored (${verified.problems.join(', ')}).`
          }
        />
      ) : null}
    </Modal>
  );
}
