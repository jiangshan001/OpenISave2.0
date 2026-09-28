import { PlusOutlined } from '@ant-design/icons';
import { Button, Card, Space, Switch, Tabs } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useCategories } from '@/hooks/useResources';
import type { Category, CategoryKind } from '@/types';
import { buildTree } from './categoryTree';
import { CategoryFormModal } from './components/CategoryFormModal';
import { CategoryTree } from './components/CategoryTree';

export function CategoriesPage() {
  const navigate = useNavigate();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [showArchived, setShowArchived] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [defaultParent, setDefaultParent] = useState<number | null>(null);

  const query = useCategories(kind, showArchived);
  const tree = useMemo(() => buildTree(query.data ?? []), [query.data]);

  const openCreate = (parentId: number | null = null) => {
    setEditing(null);
    setDefaultParent(parentId);
    setFormOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing(category);
    setDefaultParent(null);
    setFormOpen(true);
  };

  const content = (
    <StateBoundary
      isLoading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      <CategoryTree
        nodes={tree}
        loading={query.isFetching}
        onEdit={openEdit}
        onAddChild={(parent) => openCreate(parent.id)}
      />
    </StateBoundary>
  );

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Organise how your spending and income are filed. Archiving never rewrites history."
        actions={
          <Space>
            <Space size={6}>
              <Switch size="small" checked={showArchived} onChange={setShowArchived} id="show-archived-categories" />
              <label htmlFor="show-archived-categories" className="oi-muted">
                Show archived
              </label>
            </Space>
            <Button onClick={() => navigate('/categories/rules')}>Auto-categorisation rules</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate(null)}>
              New category
            </Button>
          </Space>
        }
      />

      <Card variant="borderless" styles={{ body: { paddingTop: 8 } }}>
        <Tabs
          activeKey={kind}
          onChange={(value) => setKind(value as CategoryKind)}
          items={[
            { key: 'expense', label: 'Expense', children: content },
            { key: 'income', label: 'Income', children: content },
          ]}
        />
      </Card>

      <CategoryFormModal
        open={formOpen}
        kind={kind}
        categories={query.data ?? []}
        category={editing}
        defaultParentId={defaultParent}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setDefaultParent(null);
        }}
      />
    </>
  );
}
