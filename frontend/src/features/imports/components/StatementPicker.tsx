import { InboxOutlined, LockOutlined } from '@ant-design/icons';
import { Card, Upload } from 'antd';

interface StatementPickerProps {
  loading: boolean;
  onFile: (file: File) => void;
}

/** Step 1. Choosing a file only parses it; nothing is written until confirm. */
export function StatementPicker({ loading, onFile }: StatementPickerProps) {
  return (
    <Card variant="borderless">
      <Upload.Dragger
        accept=".xlsx"
        multiple={false}
        showUploadList={false}
        disabled={loading}
        beforeUpload={(file) => {
          onFile(file);
          return false; // never let antd upload anything
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">
          {loading ? 'Reading the statement…' : 'Choose a WeChat Pay statement (.xlsx)'}
        </p>
        <p className="ant-upload-hint">
          微信 → 我 → 服务 → 钱包 → 账单 → 常见问题 → 下载账单 → 用于个人对账
        </p>
      </Upload.Dragger>
      <div className="oi-row-meta" style={{ marginTop: 12, display: 'flex', gap: 6 }}>
        <LockOutlined />
        <span>
          Read on this computer only. Nothing is uploaded, the file is not kept, and no
          transaction is recorded until you confirm the import.
        </span>
      </div>
    </Card>
  );
}
