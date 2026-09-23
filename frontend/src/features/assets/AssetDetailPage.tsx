import { ArrowLeftOutlined, EditOutlined, LineChartOutlined, TagOutlined } from '@ant-design/icons';
import { Button, Card, Col, Descriptions, Row, Space, Table, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useAsset } from '@/hooks/useAssets';
import type { AssetValuation } from '@/types/asset';
import { formatDate } from '@/utils/dates';
import { formatMoney } from '@/utils/money';
import { AssetFormModal } from './components/AssetFormModal';
import { AssetHoldingCost } from './components/AssetHoldingCost';
import { AssetSellModal } from './components/AssetSellModal';
import { AssetValuationModal } from './components/AssetValuationModal';

const STATUS_COLOR: Record<string, string> = {
  holding: 'green',
  sold: 'default',
  disposed: 'orange',
};

export function AssetDetailPage() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const id = Number(assetId);
  const [editOpen, setEditOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);

  const { data: asset, isLoading, error, refetch } = useAsset(id);
  const held = asset?.status === 'holding';

  return (
    <>
      <PageHeader
        title={asset?.name ?? 'Asset'}
        subtitle={asset?.category_name ?? undefined}
        actions={
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/assets')}>
              All assets
            </Button>
            {held ? (
              <>
                <Button icon={<LineChartOutlined />} onClick={() => setValueOpen(true)}>
                  Add valuation
                </Button>
                <Button icon={<TagOutlined />} onClick={() => setSellOpen(true)}>
                  Sell
                </Button>
              </>
            ) : null}
            <Button type="primary" icon={<EditOutlined />} disabled={!asset} onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          </Space>
        }
      />

      <StateBoundary isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {asset ? (
          <>
            <AssetHoldingCost asset={asset} />

            <Row gutter={[16, 16]} className="oi-section-gap">
              <Col xs={24} xl={12}>
                <Card title="Details" variant="borderless" style={{ height: '100%' }}>
                  <Descriptions size="small" column={2} colon={false}>
                    <Descriptions.Item label="Status">
                      <Tag color={STATUS_COLOR[asset.status]}>{asset.status}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Currency">
                      {asset.purchase_currency}
                    </Descriptions.Item>
                    <Descriptions.Item label="Purchased">
                      {formatDate(asset.purchase_date)}
                    </Descriptions.Item>
                    <Descriptions.Item label="Net worth">
                      {asset.include_in_net_worth ? (
                        <Tag color="blue">Included</Tag>
                      ) : (
                        <Tag color="orange">Excluded</Tag>
                      )}
                    </Descriptions.Item>
                    {asset.sale_date ? (
                      <Descriptions.Item label="Sold">
                        {formatDate(asset.sale_date)}
                      </Descriptions.Item>
                    ) : null}
                    <Descriptions.Item label="Financed by">
                      {asset.liability_name ?? '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Note" span={2}>
                      {asset.note ?? '—'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              </Col>
              <Col xs={24} xl={12}>
                <Card
                  title="Valuation history"
                  variant="borderless"
                  styles={{ body: { padding: 0 } }}
                  extra={
                    held ? (
                      <Button type="link" size="small" onClick={() => setValueOpen(true)}>
                        Add
                      </Button>
                    ) : null
                  }
                >
                  <Table<AssetValuation>
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={asset.valuations}
                    locale={{
                      emptyText: (
                        <span className="oi-muted">
                          No valuations yet — the purchase price is used
                        </span>
                      ),
                    }}
                    columns={[
                      {
                        title: 'As at',
                        render: (_, row) => formatDate(row.valuation_date),
                      },
                      {
                        title: 'Value',
                        align: 'right',
                        render: (_, row) => formatMoney(row.value_minor, row.currency),
                      },
                      { title: 'Note', dataIndex: 'note', render: (value) => value ?? '—' },
                    ]}
                  />
                </Card>
              </Col>
            </Row>

            <AssetFormModal open={editOpen} asset={asset} onClose={() => setEditOpen(false)} />
            <AssetSellModal open={sellOpen} asset={asset} onClose={() => setSellOpen(false)} />
            <AssetValuationModal
              open={valueOpen}
              asset={asset}
              onClose={() => setValueOpen(false)}
            />
          </>
        ) : null}
      </StateBoundary>
    </>
  );
}
