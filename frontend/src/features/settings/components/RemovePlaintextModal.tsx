import { Alert, Checkbox, Modal, Space, Typography } from 'antd';
import { useState } from 'react';

import { useRemovePlaintext } from '@/hooks/useSecurity';

interface RemovePlaintextModalProps {
  open: boolean;
  files: string[];
  onClose: () => void;
}

/** Securely removes the unencrypted copies left by the 2.0 → 2.1 migration. */
export function RemovePlaintextModal({ open, files, onClose }: RemovePlaintextModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const remove = useRemovePlaintext(onClose);

  return (
    <Modal
      open={open}
      title="Securely remove old plaintext backup"
      okText="Remove permanently"
      okButtonProps={{ danger: true, disabled: !confirmed }}
      confirmLoading={remove.isPending}
      onOk={() => remove.mutate()}
      onCancel={onClose}
      afterClose={() => setConfirmed(false)}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="These unencrypted files are your last rollback to OpenISave 2.0"
          description="Your data now lives in the encrypted vault, and at least one verified encrypted backup exists. Each file below is overwritten with random data and then deleted. This cannot be undone."
        />
        <div>
          {files.map((file) => (
            <Typography.Text key={file} code style={{ display: 'block', fontSize: 12 }}>
              {file}
            </Typography.Text>
          ))}
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          On SSDs, overwritten blocks can survive inside the drive. BitLocker full-disk encryption
          is the only complete protection for data that was once stored unencrypted.
        </Typography.Text>
        <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}>
          I confirm the encrypted data opens correctly and I no longer need these files
        </Checkbox>
      </Space>
    </Modal>
  );
}
