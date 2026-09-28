import { DownOutlined, ImportOutlined, PlusOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Card, Dropdown, Space } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useAccounts, useTransactions } from '@/hooks/useLedger';
import { useCategories } from '@/hooks/useResources';
import type { Transaction } from '@/types';
import { TransactionFilters, type FilterState } from './components/TransactionFilters';
import { TransactionFormModal } from './components/TransactionFormModal';
import { TransactionTable } from './components/TransactionTable';
import { TransferFormModal } from './components/TransferFormModal';

const PAGE_SIZE = 25;

export function TransactionsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FilterState>({});
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const { data: accounts } = useAccounts(true);
  // Include archived categories so historical rows keep their names.
  const { data: categories } = useCategories(undefined, true);
  const query = useTransactions({
    ...filters,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const hasAccounts = (accounts ?? []).some((account) => !account.is_archived);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleFilterChange = (next: FilterState) => {
    setFilters(next);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Income, expenses and transfers across every account."
        actions={
          <Space>
            <Dropdown
              disabled={!hasAccounts}
              menu={{
                items: [{ key: 'wechat', label: 'WeChat Pay Statement (.xlsx)' }],
                onClick: ({ key }) => navigate(`/transactions/import/${key}`),
              }}
            >
              <Button icon={<ImportOutlined />}>
                Import <DownOutlined />
              </Button>
            </Dropdown>
            <Button
              icon={<SwapOutlined />}
              disabled={!hasAccounts}
              onClick={() => setTransferOpen(true)}
            >
              Transfer
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!hasAccounts}
              onClick={openCreate}
            >
              Add transaction
            </Button>
          </Space>
        }
      />

      <TransactionFilters
        value={filters}
        accounts={accounts ?? []}
        categories={categories ?? []}
        onChange={handleFilterChange}
      />

      <Card variant="borderless" styles={{ body: { padding: 0 } }}>
        <StateBoundary
          isLoading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={!hasAccounts}
          emptyTitle="Add an account first"
          emptyDescription="Transactions need somewhere to live. Create a bank account, then record your first entry."
        >
          <TransactionTable
            rows={query.data?.items ?? []}
            accounts={accounts ?? []}
            categories={categories ?? []}
            loading={query.isFetching}
            onEdit={(transaction) => {
              setEditing(transaction);
              setFormOpen(true);
            }}
            pagination={{
              total: query.data?.total ?? 0,
              pageSize: PAGE_SIZE,
              current: page,
              onChange: setPage,
            }}
          />
        </StateBoundary>
      </Card>

      <TransactionFormModal
        open={formOpen}
        transaction={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <TransferFormModal open={transferOpen} onClose={() => setTransferOpen(false)} />
    </>
  );
}
