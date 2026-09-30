import { ArrowDownOutlined, ArrowUpOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, Popconfirm, Space, Switch, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';

import { PageHeader } from '@/components/common/PageHeader';
import { StateBoundary } from '@/components/common/StateBoundary';
import { useRuleCommands, useRules } from '@/hooks/useImports';
import { useCategories } from '@/hooks/useResources';
import type { CategorisationRule } from '@/types/imports';
import { buildCategoryOptions } from '../transactions/categoryOptions';
import { RuleFormModal } from './components/RuleFormModal';

export function RulesPage() {
  const rules = useRules();
  const { toggle, remove, reorder } = useRuleCommands();
  const { data: categories } = useCategories(undefined, true);
  const [editing, setEditing] = useState<CategorisationRule | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const labels = new Map(buildCategoryOptions(categories ?? []).map((o) => [o.value, o.label]));
  const all = rules.data ?? [];
  const userIds = all.filter((rule) => rule.origin === 'user').map((rule) => rule.id);

  const move = (id: number, delta: number) => {
    const ids = [...userIds];
    const at = ids.indexOf(id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    reorder.mutate(ids);
  };

  const columns: ColumnsType<CategorisationRule> = [
    {
      title: '#',
      width: 76,
      render: (_, rule, index) =>
        rule.origin === 'user' ? (
          <Space size={0}>
            <span className="oi-muted" style={{ width: 20 }}>{index + 1}</span>
            <Button size="small" type="text" icon={<ArrowUpOutlined />} aria-label="Move up"
              disabled={userIds[0] === rule.id} onClick={() => move(rule.id, -1)} />
            <Button size="small" type="text" icon={<ArrowDownOutlined />} aria-label="Move down"
              disabled={userIds[userIds.length - 1] === rule.id} onClick={() => move(rule.id, 1)} />
          </Space>
        ) : (
          <span className="oi-muted">{index + 1}</span>
        ),
    },
    {
      title: 'Condition',
      render: (_, rule) => (
        <div className="oi-import-merchant">
          <span>{rule.explanation.replace(/^(Your|Built-in) rule: /, '')}</span>
          <span className="oi-row-meta">{rule.name}</span>
        </div>
      ),
    },
    {
      title: 'Category',
      width: 220,
      render: (_, rule) => labels.get(rule.category_id) ?? <span className="oi-muted">Missing</span>,
    },
    {
      title: 'Source',
      width: 110,
      render: (_, rule) => (
        <span className={`oi-chip ${rule.origin === 'user' ? 'oi-chip--primary' : ''}`}>
          {rule.origin === 'user' ? 'Yours' : 'Built-in'}
        </span>
      ),
    },
    {
      title: 'On',
      width: 70,
      render: (_, rule) => (
        <Switch size="small" checked={rule.is_enabled} aria-label="Enabled"
          onChange={(enabled) => toggle.mutate({ id: rule.id, enabled })} />
      ),
    },
    {
      title: '',
      width: 140,
      align: 'right',
      render: (_, rule) => (
        <Space size={0}>
          <Button size="small" type="link" onClick={() => { setEditing(rule); setFormOpen(true); }}>
            Edit
          </Button>
          {rule.origin === 'user' ? (
            <Popconfirm title="Delete this rule?" okText="Delete" onConfirm={() => remove.mutate(rule.id)}>
              <Button size="small" type="link" danger>Delete</Button>
            </Popconfirm>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Categorisation rules"
        subtitle="Imports are classified by these rules, top to bottom: your rules first (in your order), then the built-ins. No AI is involved."
        actions={
          <Button type="primary" icon={<PlusOutlined />}
            onClick={() => { setEditing(null); setFormOpen(true); }}>
            New rule
          </Button>
        }
      />
      <Card variant="borderless" styles={{ body: { padding: 0 } }}>
        <StateBoundary isLoading={rules.isLoading} error={rules.error} onRetry={() => void rules.refetch()}>
          <Table<CategorisationRule>
            rowKey="id"
            size="middle"
            dataSource={all}
            columns={columns}
            pagination={false}
            rowClassName={(rule) => (rule.is_enabled ? '' : 'oi-muted')}
          />
        </StateBoundary>
      </Card>
      <RuleFormModal open={formOpen} rule={editing} onClose={() => setFormOpen(false)} />
    </>
  );
}
