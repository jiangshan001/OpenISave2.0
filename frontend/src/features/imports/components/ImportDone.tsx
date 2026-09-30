import { Button, Card, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

import type { ImportResult } from '@/types/imports';

export function ImportDone({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  const navigate = useNavigate();
  const parts = [
    `${result.duplicate_count} already imported`,
    `${result.skipped_count} skipped`,
    `${result.ignored_count} ignored`,
  ];
  return (
    <Card variant="borderless">
      <Result
        status="success"
        title={`${result.imported_count} transaction${result.imported_count === 1 ? '' : 's'} imported`}
        subTitle={`${result.detected_count} detected · ${parts.join(' · ')}. Balances, reports and budgets are updated.`}
        extra={[
          <Button key="view" type="primary" onClick={() => navigate('/transactions')}>
            View transactions
          </Button>,
          <Button key="again" onClick={onAgain}>
            Import another statement
          </Button>,
        ]}
      />
    </Card>
  );
}
