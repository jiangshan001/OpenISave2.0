import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, InputNumber, Row, Space, Table, Tag } from 'antd';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useFxRates, useRefreshFx, useSettings, useUpdateSettings } from '@/hooks/useResources';
import type { FxRateStatus } from '@/types';
import { formatDate } from '@/utils/dates';
import { CURRENCY_META } from '@/utils/money';
import { DataSecurityCard } from './components/DataSecurityCard';
import { ManualRateModal } from './components/ManualRateModal';

const FRESHNESS_TONE: Record<string, string> = {
  fresh: 'green',
  stale: 'orange',
  missing: 'red',
  identity: 'default',
};

export function SettingsPage() {
  const [manualOpen, setManualOpen] = useState(false);
  const [staleDays, setStaleDays] = useState<number | null>(null);

  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const rates = useFxRates();
  const refresh = useRefreshFx();

  const effectiveStaleDays = staleDays ?? settings.data?.fx_stale_after_days ?? 3;

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Base currency, exchange rates, and how your data is stored and protected."
      />

      <div style={{ marginBottom: 16 }}>
        <DataSecurityCard />
      </div>

      <StateBoundary
        isLoading={settings.isLoading}
        error={settings.error}
        onRetry={() => void settings.refetch()}
      >
        {settings.data ? (
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={10}>
              <Card title="Reporting" variant="borderless">
                <Descriptions column={1} size="small" colon={false}>
                  <Descriptions.Item label="Base currency">
                    <Tag color="blue">{settings.data.base_currency}</Tag>
                    <span className="oi-muted">
                      {CURRENCY_META[settings.data.base_currency]?.name}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Timezone">{settings.data.timezone}</Descriptions.Item>
                  <Descriptions.Item label="Supported currencies">
                    <Space size={4} wrap>
                      {settings.data.supported_currencies.map((code) => (
                        <Tag key={code} bordered={false}>
                          {code}
                        </Tag>
                      ))}
                    </Space>
                  </Descriptions.Item>
                </Descriptions>
                <p className="oi-muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  All consolidated figures are reported in {settings.data.base_currency}. Accounts
                  and transactions always keep their own currency.
                </p>
              </Card>

              <Card title="Exchange rate freshness" variant="borderless" className="oi-section-gap">
                <Space align="center" wrap>
                  <span>Treat a rate as stale after</span>
                  <InputNumber
                    min={1}
                    max={365}
                    value={effectiveStaleDays}
                    onChange={(value) => setStaleDays(value)}
                    style={{ width: 90 }}
                  />
                  <span>days</span>
                  <Button
                    type="primary"
                    loading={updateSettings.isPending}
                    disabled={staleDays === null || staleDays === settings.data.fx_stale_after_days}
                    onClick={() =>
                      updateSettings.mutate({ fx_stale_after_days: effectiveStaleDays })
                    }
                  >
                    Save
                  </Button>
                </Space>
              </Card>

              <Card title="Privacy" variant="borderless" className="oi-section-gap">
                <p className="oi-muted" style={{ marginTop: 0, marginBottom: 0 }}>
                  Nothing financial leaves this computer — the only outbound request is for
                  exchange rates, which sends currency codes only.
                </p>
              </Card>
            </Col>

            <Col xs={24} xl={14}>
              <Card
                title={`Exchange rates to ${settings.data.base_currency}`}
                variant="borderless"
                extra={
                  <Space>
                    <Button icon={<EditOutlined />} onClick={() => setManualOpen(true)}>
                      Manual rate
                    </Button>
                    <Button
                      type="primary"
                      icon={<ReloadOutlined />}
                      loading={refresh.isPending}
                      onClick={() => refresh.mutate()}
                    >
                      Refresh
                    </Button>
                  </Space>
                }
                styles={{ body: { padding: 0 } }}
              >
                <StateBoundary
                  isLoading={rates.isLoading}
                  error={rates.error}
                  onRetry={() => void rates.refetch()}
                >
                  <Table<FxRateStatus>
                    rowKey="from_currency"
                    size="small"
                    pagination={false}
                    dataSource={rates.data ?? []}
                    columns={[
                      {
                        title: 'Pair',
                        render: (_, row) => `${row.from_currency} / ${row.to_currency}`,
                      },
                      {
                        title: 'Rate',
                        align: 'right',
                        render: (_, row) =>
                          row.rate ? (
                            Number(row.rate).toFixed(4)
                          ) : (
                            <span className="oi-muted">—</span>
                          ),
                      },
                      {
                        title: 'Updated',
                        render: (_, row) => formatDate(row.rate_date),
                      },
                      {
                        title: 'Source',
                        render: (_, row) => row.source ?? <span className="oi-muted">—</span>,
                      },
                      {
                        title: 'Status',
                        render: (_, row) => (
                          <Tag color={FRESHNESS_TONE[row.freshness]}>{row.freshness}</Tag>
                        ),
                      },
                    ]}
                  />
                </StateBoundary>
                <p className="oi-muted" style={{ padding: '12px 16px', marginBottom: 0 }}>
                  When no rate is available OpenISave refuses the conversion rather than assuming a
                  rate of 1. Enter a manual rate to continue working offline.
                </p>
              </Card>
            </Col>
          </Row>
        ) : null}
      </StateBoundary>

      <ManualRateModal open={manualOpen} onClose={() => setManualOpen(false)} />
    </>
  );
}
