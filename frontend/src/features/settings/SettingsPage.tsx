import { EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Col, InputNumber, Row, Space, Table, Tag } from 'antd';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useFxRates, useRefreshFx, useSettings, useUpdateSettings } from '@/hooks/useResources';
import type { FxRateStatus } from '@/types';
import { formatDate } from '@/utils/dates';
import { CURRENCY_META } from '@/utils/money';
import { AppearanceCard } from './components/AppearanceCard';
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
        subtitle="Appearance, base currency, exchange rates, and how your data is stored and protected."
      />

      <div className="oi-stack-gap">
        <DataSecurityCard />
      </div>

      <StateBoundary
        isLoading={settings.isLoading}
        error={settings.error}
        onRetry={() => void settings.refetch()}
      >
        {settings.data ? (
          <Row gutter={[20, 20]}>
            <Col xs={24} xl={10}>
              <AppearanceCard />

              <Card title="Reporting" variant="borderless" className="oi-section-gap">
                <dl className="oi-facts">
                  <div>
                    <dt>Base currency</dt>
                    <dd>
                      <span className="oi-chip oi-chip--primary">{settings.data.base_currency}</span>{' '}
                      <span className="oi-muted">
                        {CURRENCY_META[settings.data.base_currency]?.name}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Timezone</dt>
                    <dd>{settings.data.timezone}</dd>
                  </div>
                  <div>
                    <dt>Supported currencies</dt>
                    <dd>
                      <Space size={4} wrap>
                        {settings.data.supported_currencies.map((code) => (
                          <Tag key={code} bordered={false}>
                            {code}
                          </Tag>
                        ))}
                      </Space>
                    </dd>
                  </div>
                </dl>
                <p className="oi-note">
                  All consolidated figures are reported in {settings.data.base_currency}. Accounts
                  and transactions always keep their own currency.
                </p>
              </Card>

              <Card title="Exchange rate freshness" variant="borderless" className="oi-section-gap">
                <div className="oi-setting-row">
                  <label className="oi-setting-label" htmlFor="stale-days">
                    Treat a rate as stale after
                  </label>
                  <Space align="center">
                    <InputNumber
                      id="stale-days"
                      min={1}
                      max={365}
                      value={effectiveStaleDays}
                      onChange={(value) => setStaleDays(value)}
                      addonAfter="days"
                      className="oi-input-days"
                    />
                    <Button
                      type="primary"
                      loading={updateSettings.isPending}
                      disabled={
                        staleDays === null || staleDays === settings.data.fx_stale_after_days
                      }
                      onClick={() =>
                        updateSettings.mutate({ fx_stale_after_days: effectiveStaleDays })
                      }
                    >
                      Save
                    </Button>
                  </Space>
                </div>
              </Card>

              <Card title="Privacy" variant="borderless" className="oi-section-gap">
                <p className="oi-note oi-flush">
                  Nothing financial leaves this computer. The only outbound request is for
                  exchange rates, and it sends currency codes only.
                </p>
              </Card>
            </Col>

            <Col xs={24} xl={14}>
              <Card
                title={`Exchange rates to ${settings.data.base_currency}`}
                variant="borderless"
                className="oi-card-flush"
                extra={
                  <Space>
                    <Button icon={<EditOutlined />} onClick={() => setManualOpen(true)}>
                      Manual rate
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      loading={refresh.isPending}
                      onClick={() => refresh.mutate()}
                    >
                      Refresh
                    </Button>
                  </Space>
                }
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
                        render: (_, row) => (
                          <span className="oi-strong">
                            {row.from_currency}
                            <span className="oi-muted"> / {row.to_currency}</span>
                          </span>
                        ),
                      },
                      {
                        title: 'Rate',
                        align: 'right',
                        render: (_, row) =>
                          row.rate ? (
                            Number(row.rate).toFixed(4)
                          ) : (
                            <span className="oi-muted">-</span>
                          ),
                      },
                      {
                        title: 'Updated',
                        render: (_, row) => formatDate(row.rate_date),
                      },
                      {
                        title: 'Source',
                        render: (_, row) =>
                          row.source ?? <span className="oi-muted">-</span>,
                      },
                      {
                        title: 'Status',
                        render: (_, row) => (
                          <Tag color={FRESHNESS_TONE[row.freshness]} bordered={false}>
                            {row.freshness}
                          </Tag>
                        ),
                      },
                    ]}
                  />
                </StateBoundary>
                <p className="oi-panel-note">
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
