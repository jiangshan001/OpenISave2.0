import { ArrowLeftOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Steps } from 'antd';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { useAccounts } from '@/hooks/useLedger';
import { useCategories } from '@/hooks/useResources';
import { AccountMapping } from './components/AccountMapping';
import { ConfirmBar } from './components/ConfirmBar';
import { ImportDone } from './components/ImportDone';
import { IgnoredItems } from './components/IgnoredItems';
import { ImportHistory } from './components/ImportHistory';
import { ImportSummaryBar } from './components/ImportSummaryBar';
import { ReviewTable } from './components/ReviewTable';
import { StatementPicker } from './components/StatementPicker';
import { useImportSession } from './useImportSession';

export function WeChatImportPage() {
  const navigate = useNavigate();
  const session = useImportSession('wechat');
  const { data: accounts } = useAccounts(true);
  const { data: categories } = useCategories(undefined, true);
  const { preview, result } = session;

  const unmapped = preview ? preview.labels.some((label) => label.account_id === null) : true;
  const step = result ? 3 : !preview ? 0 : unmapped ? 1 : 2;

  return (
    <>
      <PageHeader
        title="Import WeChat Pay statement"
        subtitle="Parse → map accounts → review categories → import. Deterministic rules only; nothing leaves this computer."
        actions={
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/transactions')}>
            Transactions
          </Button>
        }
      />

      <Card variant="borderless" style={{ marginBottom: 20 }}>
        <Steps
          size="small"
          current={step}
          items={[
            { title: 'Choose file' },
            { title: 'Map accounts' },
            { title: 'Review' },
            { title: 'Imported' },
          ]}
        />
      </Card>

      {result ? <ImportDone result={result} onAgain={session.reset} /> : null}

      {!preview && !result ? (
        <StatementPicker loading={session.parse.isPending} onFile={(file) => session.parse.mutate(file)} />
      ) : null}

      {preview && !result ? (
        <>
          <Card variant="borderless" style={{ marginBottom: 20 }}>
            <ImportSummaryBar preview={preview} />
          </Card>

          {preview.errors.length ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 20 }}
              message={`${preview.errors.length} row(s) could not be read and will not be imported`}
              description={preview.errors
                .slice(0, 5)
                .map((error) => `Row ${error.row_number}: ${error.message}`)
                .join(' · ')}
            />
          ) : null}

          {preview.labels.length ? (
            <div style={{ marginBottom: 20 }}>
              <AccountMapping
                labels={preview.labels}
                accounts={accounts ?? []}
                currency="CNY"
                onChange={session.setMapping}
              />
            </div>
          ) : null}

          <Card
            variant="borderless"
            title="Review"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/categories/rules')}>
                Categorisation rules
              </Button>
            }
            styles={{ body: { paddingTop: 8 } }}
          >
            <ReviewTable
              rows={preview.rows}
              overrides={session.overrides}
              accounts={accounts ?? []}
              categories={categories ?? []}
              loading={session.refreshing}
              onOverride={session.setOverride}
            />
            <ConfirmBar
              summary={preview.summary}
              busy={session.confirm.isPending || session.refreshing}
              onConfirm={(options) => session.confirm.mutate(options)}
              onCancel={session.reset}
            />
          </Card>
        </>
      ) : null}

      {!preview || result ? (
        <>
          <ImportHistory />
          <IgnoredItems />
        </>
      ) : null}
    </>
  );
}
