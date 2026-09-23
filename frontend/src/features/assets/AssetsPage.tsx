import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Space, Tabs } from 'antd';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useAssets, useLiabilities } from '@/hooks/useAssets';
import { useDashboard } from '@/hooks/useResources';
import type { Asset, Liability } from '@/types/asset';
import { AssetFormModal } from './components/AssetFormModal';
import { AssetSellModal } from './components/AssetSellModal';
import { AssetTable } from './components/AssetTable';
import { AssetValuationModal } from './components/AssetValuationModal';
import { LiabilityFormModal } from './components/LiabilityFormModal';
import { LiabilityRepayModal } from './components/LiabilityRepayModal';
import { LiabilityTable } from './components/LiabilityTable';

export function AssetsPage() {
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [liabilityFormOpen, setLiabilityFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [editingLiability, setEditingLiability] = useState<Liability | null>(null);
  const [selling, setSelling] = useState<Asset | null>(null);
  const [valuing, setValuing] = useState<Asset | null>(null);
  const [repaying, setRepaying] = useState<Liability | null>(null);

  const holding = useAssets('holding');
  const sold = useAssets('sold');
  const liabilities = useLiabilities();
  const dashboard = useDashboard();

  const base = dashboard.data?.base_currency ?? 'CNY';
  const physical = dashboard.data?.physical_assets_minor ?? 0;
  const debts = dashboard.data?.total_liabilities_minor ?? 0;

  const openCreateAsset = () => {
    setEditingAsset(null);
    setAssetFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Assets"
        subtitle="What you own and what you owe, alongside what each thing costs you to keep."
        actions={
          <Space>
            <Button
              onClick={() => {
                setEditingLiability(null);
                setLiabilityFormOpen(true);
              }}
            >
              Add liability
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAsset}>
              Add asset
            </Button>
          </Space>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <StatCard label="Physical assets" amountMinor={physical} currency={base} />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            label="Outstanding debt"
            amountMinor={debts}
            currency={base}
            tone={debts > 0 ? 'negative' : 'neutral'}
          />
        </Col>
        <Col xs={24} sm={8}>
          <StatCard
            label="Net asset value"
            amountMinor={physical - debts}
            currency={base}
            hint="Physical assets minus everything you owe."
            tone="auto"
          />
        </Col>
      </Row>

      <Card variant="borderless" styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          items={[
            {
              key: 'holding',
              label: `Holding (${holding.data?.length ?? 0})`,
              children: (
                <StateBoundary
                  isLoading={holding.isLoading}
                  error={holding.error}
                  onRetry={() => void holding.refetch()}
                  isEmpty={(holding.data ?? []).length === 0}
                  emptyTitle="No assets yet"
                  emptyDescription="Record the things you own — a laptop, a phone, a camera — to see what each costs you per day."
                  emptyAction={
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateAsset}>
                      Add your first asset
                    </Button>
                  }
                >
                  <AssetTable
                    rows={holding.data ?? []}
                    loading={holding.isFetching}
                    onSell={setSelling}
                    onValue={setValuing}
                  />
                </StateBoundary>
              ),
            },
            {
              key: 'sold',
              label: `Sold (${sold.data?.length ?? 0})`,
              children: (
                <StateBoundary
                  isLoading={sold.isLoading}
                  error={sold.error}
                  onRetry={() => void sold.refetch()}
                >
                  <AssetTable rows={sold.data ?? []} loading={sold.isFetching} sold />
                </StateBoundary>
              ),
            },
            {
              key: 'liabilities',
              label: `Liabilities (${liabilities.data?.length ?? 0})`,
              children: (
                <StateBoundary
                  isLoading={liabilities.isLoading}
                  error={liabilities.error}
                  onRetry={() => void liabilities.refetch()}
                >
                  <LiabilityTable
                    rows={liabilities.data ?? []}
                    loading={liabilities.isFetching}
                    onEdit={(item) => {
                      setEditingLiability(item);
                      setLiabilityFormOpen(true);
                    }}
                    onRepay={setRepaying}
                  />
                </StateBoundary>
              ),
            },
          ]}
        />
      </Card>

      <AssetFormModal
        open={assetFormOpen}
        asset={editingAsset}
        onClose={() => {
          setAssetFormOpen(false);
          setEditingAsset(null);
        }}
      />
      <AssetSellModal open={selling !== null} asset={selling} onClose={() => setSelling(null)} />
      <AssetValuationModal
        open={valuing !== null}
        asset={valuing}
        onClose={() => setValuing(null)}
      />
      <LiabilityFormModal
        open={liabilityFormOpen}
        liability={editingLiability}
        onClose={() => {
          setLiabilityFormOpen(false);
          setEditingLiability(null);
        }}
      />
      <LiabilityRepayModal
        open={repaying !== null}
        liability={repaying}
        onClose={() => setRepaying(null)}
      />
    </>
  );
}
