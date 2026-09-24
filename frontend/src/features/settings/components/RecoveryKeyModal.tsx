import { CopyOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, Modal, Space, Typography } from 'antd';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { errorMessage } from '@/api/client';
import { securityApi } from '@/api/security';

interface RecoveryKeyModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Reveals the recovery key on an explicit click. The key lives only in this
 * component's state and is dropped as soon as the dialog closes; it is never
 * cached by React Query or written anywhere by the app.
 */
export function RecoveryKeyModal({ open, onClose }: RecoveryKeyModalProps) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stored, setStored] = useState(false);

  const close = () => {
    setRecoveryKey(null);
    setStored(false);
    void client.invalidateQueries({ queryKey: ['security'] });
    onClose();
  };

  const reveal = async () => {
    setLoading(true);
    try {
      setRecoveryKey((await securityApi.exportRecoveryKey()).recovery_key);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!recoveryKey) return;
    await navigator.clipboard.writeText(recoveryKey);
    message.success('Recovery key copied. Paste it somewhere safe, then clear your clipboard.');
  };

  const save = () => {
    if (!recoveryKey) return;
    const text =
      'OpenISave recovery key\n\n' +
      `${recoveryKey}\n\n` +
      'This key unlocks your encrypted OpenISave database and backups on any Windows PC.\n' +
      'Anyone holding it together with a copy of your data can read your finances.\n' +
      'Keep it offline (printed, or in a password manager) and never next to the data folder.\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'OpenISave-recovery-key.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      title="Export recovery key"
      onCancel={close}
      destroyOnHidden
      footer={
        <Button type="primary" onClick={close} disabled={Boolean(recoveryKey) && !stored}>
          Done
        </Button>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="Treat this like the key to your finances"
          description="The recovery key unlocks your encrypted database on a new Windows installation if Windows Credential Manager is lost. Anyone with it and a copy of your data can read everything. Store it offline — never in the OpenISave data folder."
        />
        {recoveryKey ? (
          <>
            <Typography.Paragraph
              code
              copyable={false}
              style={{ fontSize: 15, wordBreak: 'break-all', margin: 0 }}
            >
              {recoveryKey}
            </Typography.Paragraph>
            <Space wrap>
              <Button icon={<CopyOutlined />} onClick={() => void copy()}>
                Copy
              </Button>
              <Button icon={<DownloadOutlined />} onClick={save}>
                Save as text file
              </Button>
            </Space>
            <Checkbox checked={stored} onChange={(event) => setStored(event.target.checked)}>
              I have stored my recovery key somewhere safe
            </Checkbox>
          </>
        ) : (
          <Button type="primary" icon={<EyeOutlined />} loading={loading} onClick={() => void reveal()}>
            Reveal recovery key
          </Button>
        )}
      </Space>
    </Modal>
  );
}
